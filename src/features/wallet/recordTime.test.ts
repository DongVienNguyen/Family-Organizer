import { describe, it, expect } from 'vitest';
import { localRecordTime, recordTimeCandidates, resolveRecordTime } from './recordTime.js';
describe('explicit Wallet occurrence time', () => {
    it('round trips milliseconds in the named family timezone, independent of host timezone', () => {
        expect(localRecordTime('2026-10-17T03:04:05.006Z', 'Asia/Ho_Chi_Minh')).toBe('2026-10-17T10:04:05.006');
        expect(resolveRecordTime('2026-10-17T10:04:05.006', 'Asia/Ho_Chi_Minh')).toBe('2026-10-17T03:04:05.006Z');
    });
    it('does not fabricate an unknown occurrence timestamp', () => { expect(localRecordTime(null, 'Asia/Ho_Chi_Minh')).toBe(''); expect(resolveRecordTime('', 'Asia/Ho_Chi_Minh')).toBeNull(); });
    it.each(['2026-03-08T02:30', '2026-03-08T02:00:00.001'])('rejects nonexistent New York local time %s', local => {
        expect(recordTimeCandidates(local, 'America/New_York')).toEqual([]);
        expect(() => resolveRecordTime(local, 'America/New_York')).toThrow('NONEXISTENT_LOCAL_TIME');
    });
    it('requires explicit choice for overlapping local time and preserves both exact candidates', () => {
        const local = '2026-11-01T01:30:12.345';
        expect(recordTimeCandidates(local, 'America/New_York')).toEqual(['2026-11-01T05:30:12.345Z', '2026-11-01T06:30:12.345Z']);
        expect(() => resolveRecordTime(local, 'America/New_York')).toThrow('AMBIGUOUS_LOCAL_TIME');
        expect(resolveRecordTime(local, 'America/New_York', 'earlier')).toBe('2026-11-01T05:30:12.345Z');
        expect(resolveRecordTime(local, 'America/New_York', 'later')).toBe('2026-11-01T06:30:12.345Z');
    });
    it('preserves an unchanged historical overlap without inventing a new disambiguation choice', () => {
        const original = '2026-11-01T06:30:12.345Z';
        expect(resolveRecordTime(localRecordTime(original, 'America/New_York'), 'America/New_York', undefined, { instant: original, timezone: 'America/New_York' })).toBe(original);
    });
    it('never applies an old instant when the edited timezone differs', () => {
        const original = '2026-11-01T06:30:12.345Z';
        expect(resolveRecordTime('2026-11-01T01:30:12.345', 'UTC', undefined, { instant: original, timezone: 'America/New_York' })).toBe('2026-11-01T01:30:12.345Z');
    });
    it('honors an explicit overlap choice even when the displayed wall time is unchanged', () => {
        const original = '2026-11-01T06:30:12.345Z';
        expect(resolveRecordTime(localRecordTime(original, 'America/New_York'), 'America/New_York', 'earlier', { instant: original, timezone: 'America/New_York' })).toBe('2026-11-01T05:30:12.345Z');
    });
    it.each([['1000-01-01T00:00', 'Etc/GMT-14'], ['9999-12-31T23:59', 'Etc/GMT+12']])('never returns an instant outside supported four-digit UTC range %s %s', (local, zone) => {
        expect(recordTimeCandidates(local, zone)).toEqual([]);
        expect(() => resolveRecordTime(local, zone)).toThrow('NONEXISTENT_LOCAL_TIME');
    });
    it('handles half-hour DST transitions without an assumed one-hour offset', () => {
        expect(recordTimeCandidates('2026-04-05T01:45', 'Australia/Lord_Howe')).toEqual(['2026-04-04T14:45:00.000Z', '2026-04-04T15:15:00.000Z']);
        expect(() => resolveRecordTime('2026-10-04T02:15', 'Australia/Lord_Howe')).toThrow('NONEXISTENT_LOCAL_TIME');
    });
    it('rejects a wholly skipped calendar date', () => { expect(recordTimeCandidates('2011-12-30T12:00', 'Pacific/Apia')).toEqual([]); });
    it.each(['2026-02-30T12:00', '2026-10-17T24:00', '2026-10-17T12:60', '2026-10-17T12:00:60', '2026-10-17T12:00:00.0000', '2026-10-17 12:00', '2026-10-17T12:00Z'])('rejects malformed wall time %s', local => { expect(() => recordTimeCandidates(local, 'UTC')).toThrow(); });
    it('rejects invalid timezone and invalid preserved instant even on an empty timestamp', () => {
        expect(() => resolveRecordTime('', 'Unknown/Zone')).toThrow();
        expect(() => resolveRecordTime('2026-10-17T12:00', 'UTC', undefined, { instant: 'not-a-date', timezone: 'UTC' })).toThrow();
    });
});
