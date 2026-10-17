import { randomUUID } from 'node:crypto';
import { Router, type Request, type RequestHandler, type ErrorRequestHandler } from 'express';
import { getAppCommandContext } from '../commandContext.js';
import { AppStoreError, httpErrorStatus } from '../appErrors.js';
import { object, keys, text, integer } from '../../src/features/productivity/validation.js';
import { parseEffectiveDate } from '../../src/features/wallet/dates.js';
import type { Actor, CommandContext } from '../../src/features/wallet/contracts.js';
import type { WalletPorts } from './ports.js';
interface WalletRequest extends Request {
    userSession?: Actor;
}
const codeFor = (status: number) => status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : status === 413 ? 'LIMIT_EXCEEDED' : status >= 500 ? 'INTERNAL_ERROR' : 'INVALID_INPUT';
const knownCodes = new Set(['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'LIMIT_EXCEEDED', 'INTERNAL_ERROR', 'INVALID_INPUT', 'RATE_UNAVAILABLE']);
/** Targeted internal namespace; normalize even pre-auth/parser errors without
 * logging or echoing credentials, request bodies or native SQL details. */
export const walletRequestTrace: RequestHandler = (req, res, next) => {
    if (res.locals.walletRequestId) {
        next();
        return;
    }
    const input = req.get('x-request-id'), id = input && /^[A-Za-z0-9_-]{1,128}$/.test(input) ? input : randomUUID();
    res.locals.walletRequestId = id;
    res.set('x-request-id', id);
    res.set('Cache-Control', 'no-store');
    const json = res.json.bind(res);
    res.json = (body: any) => { if (res.statusCode >= 400) {
        const code = knownCodes.has(body?.code) ? body.code : codeFor(res.statusCode), safe = res.statusCode >= 500 ? 'Không xử lý được yêu cầu Wallet.' : typeof body?.error === 'string' ? body.error : 'Yêu cầu Wallet không hợp lệ.';
        return json({ error: safe, code, requestId: id });
    } return json(body); };
    next();
};
export const walletJsonError: ErrorRequestHandler = (error, _req, res, _next) => { const status = (error as any)?.status === 413 ? 413 : 400; res.status(status).json({ error: 'Dữ liệu Wallet không hợp lệ.', code: codeFor(status) }); };
function actor(req: WalletRequest): Actor { if (!req.userSession)
    throw new AppStoreError('Cần đăng nhập.', 401); return { userId: req.userSession.userId, role: req.userSession.role }; }
function id(value: unknown): string { try {
    text(value, 256);
    return value;
}
catch {
    throw new AppStoreError('Mã tài nguyên không hợp lệ.', 400);
} }
function body(req: Request, allowed: string[]): Record<string, any> { try {
    const value = object(req.body);
    keys(value, allowed);
    return value;
}
catch {
    throw new AppStoreError('Dữ liệu Wallet không hợp lệ.', 400);
} }
function context(req: WalletRequest, revision: unknown, editing: boolean): CommandContext { const current = getAppCommandContext(), input = req.get('x-request-id'); if (!input || !/^[A-Za-z0-9_-]{1,128}$/.test(input) || !current || input !== current.requestId)
    throw new AppStoreError('Cần mã yêu cầu hợp lệ cho thao tác ghi.', 400); try {
    integer(revision, editing ? 1 : 0);
}
catch {
    throw new AppStoreError('Phiên bản bản ghi không hợp lệ.', 400);
} return { actor: actor(req), idempotencyKey: input, expectedRevision: revision }; }
const cleanCreator = (value: unknown) => { try {
    const { creatorId: _creator, ...input } = object(value);
    return input;
}
catch {
    throw new AppStoreError('Dữ liệu giao dịch không hợp lệ.', 400);
} };
/** App-internal Bearer session routes. No integration token/public API or activation. */
export function walletRouter(ports: WalletPorts, requireAuth: RequestHandler, changed: (audience: Set<string>) => void) {
    const router = Router(), handler = (fn: (req: WalletRequest) => unknown): RequestHandler => (req, res) => { try {
        res.json(fn(req));
    }
    catch (error) {
        const status = httpErrorStatus(error, 500);
        res.status(status).json({ error: status >= 500 ? 'Không xử lý được yêu cầu Wallet.' : error instanceof AppStoreError ? error.message : 'Dữ liệu Wallet không hợp lệ.', code: (error as any)?.code });
    } };
    router.use(walletRequestTrace, requireAuth, handlerMiddleware((req) => ports.assertActor(actor(req))));
    router.get('/status', handler(() => ({ active: ports.active(), storageVersion: ports.storageVersion() })));
    router.use(handlerMiddleware(() => { if (!ports.active())
        throw new AppStoreError('Wallet chưa sẵn sàng.', 409); }));
    const emit = (before: Set<string>, after: Set<string>) => changed(new Set([...before, ...after]));
    const manager = (req: WalletRequest, accountId: string) => { if (ports.access.getAccount(actor(req), accountId).permission !== 'manage')
        throw new AppStoreError('Không có quyền quản lý tài khoản.', 403); };
    router.get('/record-filter-options',handler(req=>ports.filterOptions(actor(req))));
    router.get('/catalog',handler(req=>ports.catalog(actor(req))));
    router.get('/accounts', handler(req => ({ accounts: ports.access.listAccounts(actor(req)) })));
    router.get('/accounts/:id', handler(req => ports.accounts.getAccount(actor(req), id(req.params.id))));
    router.get('/accounts/:id/balance', handler(req => { const accountId = id(req.params.id); let date: string; try {
        keys(object(req.query), ['date']);
        text(req.query.date, 10);
        parseEffectiveDate(req.query.date);
        date = req.query.date;
    }
    catch {
        throw new AppStoreError('Ngày xem số dư không hợp lệ.', 400);
    } const who = actor(req), account = ports.access.getAccount(who, accountId); return { date, book: ports.accounts.getBookBalance(who, accountId, date), cleared: ports.accounts.getClearedBalance(who, accountId, date), ...(account.type === 'credit' ? { credit: ports.accounts.getCreditPosition(who, accountId, date) } : {}) }; }));
    router.post('/accounts', handler(req => { const value = body(req, ['expectedRevision', 'input']), result = ports.accounts.createAccount(context(req, value.expectedRevision, false), value.input); emit(new Set(), ports.accountAudience(result.account.id)); return result; }));
    router.patch('/accounts/:id', handler(req => { const value = body(req, ['expectedRevision', 'patch']), accountId = id(req.params.id), ctx = context(req, value.expectedRevision, true); manager(req, accountId); const before = ports.accountAudience(accountId), result = ports.accounts.updateAccount(ctx, accountId, value.patch); emit(before, ports.accountAudience(accountId)); return result; }));
    router.delete('/accounts/:id', handler(req => { const value = body(req, ['expectedRevision']), accountId = id(req.params.id), ctx = context(req, value.expectedRevision, true); manager(req, accountId); const before = ports.accountAudience(accountId), result = ports.accounts.updateAccount(ctx, accountId, { archived: true }); emit(before, ports.accountAudience(accountId)); return result; }));
    router.get('/accounts/:id/grants', handler(req => ({ grants: ports.accounts.listGrants(actor(req), id(req.params.id)) })));
    router.put('/accounts/:id/grants/:userId', handler(req => { const value = body(req, ['expectedRevision', 'permission']), accountId = id(req.params.id), ctx = context(req, value.expectedRevision, true); manager(req, accountId); const before = ports.accountAudience(accountId), result = ports.accounts.setGrant(ctx, accountId, id(req.params.userId), value.permission); emit(before, ports.accountAudience(accountId)); return result; }));
    router.delete('/accounts/:id/grants/:userId', handler(req => { const value = body(req, ['expectedRevision']), accountId = id(req.params.id), ctx = context(req, value.expectedRevision, true); manager(req, accountId); const before = ports.accountAudience(accountId), result = ports.accounts.removeGrant(ctx, accountId, id(req.params.userId)); emit(before, ports.accountAudience(accountId)); return result; }));
    const query = (req: WalletRequest) => { const value = body(req, ['filter', 'cursor', 'limit']); return ports.queries.listRecords(actor(req), value.filter, value.cursor ?? null, value.limit === undefined ? 50 : value.limit); };
    router.post('/records/query', handler(query));
    router.get('/records/:id/receipts',handler(req=>ports.receipts.list(actor(req),id(req.params.id))));
    router.post('/records/:id/receipts',handler(req=>{
        const value=body(req,['expectedRevision','input']),recordId=id(req.params.id),ctx=context(req,value.expectedRevision,true),before=ports.recordAudience(recordId),result=ports.receipts.attach(ctx,recordId,value.input);
        emit(before,ports.recordAudience(recordId));return result;
    }));
    router.delete('/records/:id/receipts/:receiptId',handler(req=>{
        const value=body(req,['expectedRevision']),recordId=id(req.params.id),ctx=context(req,value.expectedRevision,true),before=ports.recordAudience(recordId),result=ports.receipts.detach(ctx,recordId,id(req.params.receiptId));
        emit(before,ports.recordAudience(recordId));return result;
    }));
    router.get('/records/:id/receipts/:receiptId',(req:WalletRequest,res)=>{
        try{
            const file=ports.receipts.read(actor(req),id(req.params.id),id(req.params.receiptId)),name=encodeURIComponent(file.fileName).replace(/['()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
            res.set('Content-Type',file.mime).set('X-Content-Type-Options','nosniff').set('Content-Security-Policy',"default-src 'none'; sandbox").set('Content-Disposition',"attachment; filename=\"receipt\"; filename*=UTF-8''"+name).send(file.bytes);
        }catch(error){const status=httpErrorStatus(error,500);res.status(status).json({error:status>=500?'Không xử lý được yêu cầu Wallet.':error instanceof AppStoreError?error.message:'Dữ liệu hóa đơn không hợp lệ.',code:(error as any)?.code});}
    });
    router.get('/records/:id/actions',handler(req=>ports.records.getActions(actor(req),id(req.params.id))));
    router.get('/records/:id', handler(req => ports.read.getRecord(actor(req), id(req.params.id))));
    router.post('/records', handler(req => { const value = body(req, ['expectedRevision', 'input']), result = ports.records.createRecord(context(req, value.expectedRevision, false), cleanCreator(value.input) as any); emit(new Set(), ports.recordAudience(result.record.id)); return result; }));
    router.patch('/records/:id', handler(req => { const value = body(req, ['expectedRevision', 'patch']), recordId = id(req.params.id), ctx = context(req, value.expectedRevision, true); ports.access.authorizeRecord(actor(req), recordId, 'write'); const before = ports.recordAudience(recordId), result = ports.records.updateRecord(ctx, recordId, cleanCreator(value.patch)); emit(before, ports.recordAudience(recordId)); return result; }));
    router.delete('/records/:id', handler(req => { const value = body(req, ['expectedRevision']), recordId = id(req.params.id), ctx = context(req, value.expectedRevision, true); ports.access.authorizeRecord(actor(req), recordId, 'write'); const before = ports.recordAudience(recordId), result = ports.records.voidRecord(ctx, recordId); emit(before, ports.recordAudience(recordId)); return result; }));
    return router;
}
function handlerMiddleware(work: (req: WalletRequest) => void): RequestHandler { return (req, res, next) => { try {
    work(req);
    next();
}
catch (error) {
    const status = httpErrorStatus(error, 500);
    res.status(status).json({ error: status >= 500 ? 'Không xử lý được yêu cầu Wallet.' : error instanceof Error ? error.message : 'Yêu cầu Wallet không hợp lệ.', code: (error as any)?.code });
} }; }
