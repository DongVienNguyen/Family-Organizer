import { describe, it, expect, vi } from 'vitest';
import { createWalletCommand } from './commandState.js';
import { WalletApiError } from './api.js';
describe('Wallet financial command state', () => {
    it('freezes input, prevents double submit and keeps the same nonce after an unknown outcome', async () => {
        let finish!: (v: unknown) => void;
        const execute = vi.fn().mockImplementationOnce(() => new Promise(resolve => finish = resolve)).mockResolvedValueOnce('saved');
        const command = createWalletCommand({ execute, newRequestId: () => 'fixed-request' }), input = { amount: '9007199254740993' };
        const first = command.submit(input);
        input.amount = '1';
        await expect(command.submit({ amount: '2' })).rejects.toThrow();
        expect(execute).toHaveBeenCalledWith({ amount: '9007199254740993' }, 'fixed-request');
        finish(Promise.reject(new WalletApiError(0, 'network', 'NETWORK_ERROR', 'fixed-request', true)));
        await first;
        expect(command.snapshot().phase).toBe('unknown');
        await expect(command.submit({ amount: '3' })).rejects.toThrow();
        expect(() => command.reset()).toThrow();
        await command.retry();
        expect(execute.mock.calls[1]).toEqual([{ amount: '9007199254740993' }, 'fixed-request']);
        expect(command.snapshot()).toMatchObject({ phase: 'success', result: 'saved' });
    });
    it('keeps conflict input but never retries it automatically', async () => {
        const execute = vi.fn().mockRejectedValue(new WalletApiError(409, 'conflict', 'CONFLICT', 'request'));
        const command = createWalletCommand({ execute, newRequestId: () => 'request' });
        await command.submit({ revision: 1 });
        expect(command.snapshot().phase).toBe('conflict');
        expect(execute).toHaveBeenCalledTimes(1);
        await expect(command.retry()).rejects.toThrow();
        command.reset();
        expect(command.snapshot().phase).toBe('idle');
    });
    it('a rejected retry cannot prove that the original unknown attempt did not commit', async () => {
        const execute = vi.fn().mockRejectedValueOnce(new WalletApiError(0, 'network', 'NETWORK_ERROR', 'r', true)).mockRejectedValueOnce(new WalletApiError(403, 'revoked', 'FORBIDDEN', 'r')).mockResolvedValueOnce('ack');
        const command = createWalletCommand({ execute, newRequestId: () => 'r' });
        await command.submit({ amount: '1' });
        await command.retry();
        expect(command.snapshot().phase).toBe('unknown');
        expect(() => command.reset()).toThrow();
        await command.retry();
        expect(command.snapshot()).toMatchObject({ phase: 'success', result: 'ack' });
        expect(execute.mock.calls.every(call => call[1] === 'r')).toBe(true);
    });
    it('treats arbitrary executor failure as unknown, never a safe rejected write', async () => {
        const command = createWalletCommand({ execute: async () => { throw Error('synthetic unexpected'); }, newRequestId: () => 'request' });
        await command.submit({ amount: '1' });
        expect(command.snapshot()).toMatchObject({ phase: 'unknown' });
    });
    it('rejects invalid nonce before calling the executor', async () => {
        const execute = vi.fn(), command = createWalletCommand({ execute, newRequestId: () => '' });
        await expect(command.submit({ amount: '1' })).rejects.toThrow();
        expect(execute).not.toHaveBeenCalled();
        expect(command.snapshot().phase).toBe('idle');
    });
    it('safe rejection allows correction and a new request, without retaining an old result', async () => {
        let id = 0;
        const execute = vi.fn().mockRejectedValueOnce(new WalletApiError(422, 'invalid', 'INVALID_INPUT', 'r1')).mockResolvedValueOnce('ok');
        const command = createWalletCommand({ execute, newRequestId: () => 'r' + ++id });
        await command.submit({ amount: '1' });
        expect(command.snapshot().phase).toBe('error');
        await command.submit({ amount: '2' });
        expect(execute.mock.calls.map(call => call[1])).toEqual(['r1', 'r2']);
    });
    it('disposal purges financial state and ignores a late completion', async () => {
        let resolve!: (value: string) => void;
        const command = createWalletCommand({ execute: () => new Promise<string>(r => resolve = r), newRequestId: () => 'r' });
        const pending = command.submit({ amount: '1' });
        command.dispose();
        resolve('private');
        await pending;
        expect(command.snapshot()).toEqual({ phase: 'disposed' });
        await expect(command.retry()).rejects.toThrow();
    });
});
