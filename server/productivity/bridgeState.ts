// Pure bootstrap state: importing contracts/storage helpers never opens SQLite.
let ready=false;
export function markCanonicalReaderReady():void {ready=true;}
export function requireCanonicalReader():void {
 if(!ready)throw new Error('Canonical legacy reader must be configured before activation');
}
