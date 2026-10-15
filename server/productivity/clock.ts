import type {TaskReader} from './access.js';
import {AppStoreError} from '../appErrors.js';
// SQLite's Windows VFS reads GetSystemTimeAsFileTime directly. V8 Date.now uses
// a separate coarse-clock/QPC anchor per process, unsuitable for cross-process
// UTC interval comparisons. Integer second+millisecond avoids floating rounding.
export const nativeClockSql="SELECT CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3)AS INTEGER) AS ms";
/** Read-only OS wall clock through the already owned connection; no DDL/open. */
export function createProductivityClock(reader:TaskReader):()=>number {return ()=>{const ms=reader.get(nativeClockSql)?.ms;if(!Number.isSafeInteger(ms))throw new AppStoreError('Không đọc được đồng hồ hệ điều hành.',503,'native-clock');return ms;};}
