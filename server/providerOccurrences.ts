/** Local server-calendar keys preserve the legacy delivery windows across ticks/restarts. */
const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const backupOccurrence = (now: Date): string | undefined => now.getHours() >= 2 && now.getHours() < 4 ? `day:${day(now)}` : undefined;
export const digestOccurrence = (now: Date): string | undefined => now.getDay() === 1 && now.getHours() >= 7 && now.getHours() < 10 ? `week:${day(now)}` : undefined;
