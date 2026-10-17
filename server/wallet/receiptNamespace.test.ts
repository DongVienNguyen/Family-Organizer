import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mayReadMedia, type MediaMetadata } from '../mediaPolicy.js';
import { saveDataUrlToFile, deleteMediaByUrl, UPLOADS_DIR } from '../media.js';
import { UserRole, type FamilyOrganizerDB } from '../../src/types.js';
const actor = { userId: 'synthetic-receipt-owner', role: UserRole.MEMBER }, png = 'data:image/png;base64,iVBORw0KGgo=';
const legacy = { users: [{ id: actor.userId, role: UserRole.MEMBER }], transactions: [], tasks: [], notes: [], documents: [], assets: [], debts: [] } as unknown as FamilyOrganizerDB;
it.each(['wallet-receipts', 'WALLET-RECEIPTS', 'Wallet-Receipts'])('generic uploads cannot allocate the private Wallet namespace %s', category => {
    expect(() => saveDataUrlToFile(png, category)).toThrow();
    expect(fs.existsSync(path.join(UPLOADS_DIR, category))).toBe(false);
});
it.each([UserRole.ADMIN, UserRole.MEMBER, UserRole.CHILD])('private paths cannot use a forged public media binding for %s', role => {
    const url = '/uploads/wallet-receipts/synthetic.png', copy = structuredClone(legacy);
    copy.users[0].avatarImage = url;
    copy.transactions = [{ id: 'synthetic-record', receiptImage: url } as any];
    const metadata: MediaMetadata = { version: 1, ownerId: actor.userId, createdAt: 0, bindings: [{ domain: 'users', id: actor.userId }, { domain: 'transactions', id: 'synthetic-record' }] };
    expect(mayReadMedia(url, metadata, copy, { ...actor, role })).toBe(false);
});
it('staging owner and case/encoding aliases cannot bypass private record authority', () => {
    const metadata: MediaMetadata = { version: 1, ownerId: actor.userId, createdAt: 0, bindings: [] };
    for (const folder of ['wallet-receipts', 'WALLET-RECEIPTS', '%77allet-receipts'])
        expect(mayReadMedia('/uploads/' + folder + '/synthetic.png', metadata, legacy, actor, 1)).toBe(false);
});
it('legacy cleanup never removes a Wallet-private file without Wallet ownership policy', () => {
    const folder = path.join(UPLOADS_DIR, 'wallet-receipts');
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, 'synthetic-owned.png');
    fs.writeFileSync(file, Buffer.from('synthetic private bytes'));
    deleteMediaByUrl('/uploads/wallet-receipts/synthetic-owned.png');
    expect(fs.readFileSync(file, 'utf8')).toBe('synthetic private bytes');
});

it('preserves the formerly valid generic receipts wallet-private subfolder', () => {
    const saved = saveDataUrlToFile(png, 'receipts', 'wallet-private');
    expect(saved.url).toMatch(/^\/uploads\/receipts\/wallet-private\//);
    const metadata: MediaMetadata = {version: 1, ownerId: actor.userId, createdAt: 0, bindings: []};
    expect(mayReadMedia(saved.url, metadata, legacy, actor, 1)).toBe(true);
    expect(fs.readFileSync(path.join(UPLOADS_DIR, saved.url.slice(9)))).toEqual(Buffer.from(png.split(',')[1], 'base64'));
});
