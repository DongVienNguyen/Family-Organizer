import { calendarDate, utcInstant, timezoneFormatter } from '../productivity/dates.js';
type Disambiguation = 'earlier' | 'later';
function clock(timezone: string) {
    timezoneFormatter(timezone);
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hourCycle: 'h23' });
}
function format(instant: number, formatter: Intl.DateTimeFormat): string {
    const values = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    const local = `${values.year.padStart(4, '0')}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}.${values.fractionalSecond}`;
    parse(local);
    return local;
}
function parse(value: string): {
    canonical: string;
    naive: number;
} {
    if (typeof value !== 'string')
        throw Error('INVALID_LOCAL_TIME');
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
    if (!match)
        throw Error('INVALID_LOCAL_TIME');
    const base = calendarDate(match[1]), hour = Number(match[2]), minute = Number(match[3]), second = Number(match[4] ?? '0'), millis = Number((match[5] ?? '').padEnd(3, '0'));
    if (hour > 23 || minute > 59 || second > 59)
        throw Error('INVALID_LOCAL_TIME');
    return { canonical: `${match[1]}T${match[2]}:${match[3]}:${match[4] ?? '00'}.${(match[5] ?? '').padEnd(3, '0')}`, naive: base + hour * 3600000 + minute * 60000 + second * 1000 + millis };
}
export function localRecordTime(instant: string | null, timezone: string): string {
    const formatter = clock(timezone);
    return instant === null ? '' : format(utcInstant(instant), formatter);
}
/** Enumerate actual IANA offsets near the selected date; do not normalize gaps
 * or assume all transitions are one hour. Exact wall-time round trips admit
 * candidates. No host timezone or implicit Date string parsing is used. */
export function recordTimeCandidates(local: string, timezone: string): string[] {
    const formatter = clock(timezone), { canonical, naive } = parse(local), offsets = new Set<number>();
    for (let hours = -48; hours <= 48; hours += 3) {
        const instant = naive + hours * 3600000;
        let wall: string;
        try {
            wall = format(instant, formatter);
        }
        catch {
            continue;
        }
        offsets.add(parse(wall).naive - instant);
    }
    const candidates = new Set<string>();
    for (const offset of offsets) {
        const instant = naive - offset;
        try {
            const utc = new Date(instant).toISOString();
            utcInstant(utc);
            if (format(instant, formatter) === canonical)
                candidates.add(utc);
        }
        catch { /* Unsupported boundary instants are not valid candidates. */ }
    }
    return [...candidates].sort();
}
export function resolveRecordTime(local: string, timezone: string, disambiguation?: Disambiguation, previous?: {
    instant: string;
    timezone: string;
}): string | null {
    clock(timezone);
    if (disambiguation !== undefined && !['earlier', 'later'].includes(disambiguation))
        throw Error('INVALID_LOCAL_TIME_CHOICE');
    if (previous) {
        utcInstant(previous.instant);
        clock(previous.timezone);
    }
    if (local === '')
        return null;
    const { canonical } = parse(local);
    if (disambiguation === undefined && previous && timezone === previous.timezone && canonical === localRecordTime(previous.instant, previous.timezone))
        return new Date(utcInstant(previous.instant)).toISOString();
    const candidates = recordTimeCandidates(canonical, timezone);
    if (candidates.length === 0)
        throw Error('NONEXISTENT_LOCAL_TIME');
    if (candidates.length === 1)
        return candidates[0];
    if (disambiguation === undefined)
        throw Error('AMBIGUOUS_LOCAL_TIME');
    return disambiguation === 'earlier' ? candidates[0] : candidates[candidates.length - 1];
}
