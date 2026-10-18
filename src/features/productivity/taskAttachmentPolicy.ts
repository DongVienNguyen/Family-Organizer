/** Task-only private download namespace; ordinary image/PDF media limits remain unchanged. */
export const maxTaskAttachmentBytes=20*1024*1024;
export const privateTaskAttachmentMediaPrefix='_task_files/';
export const taskAttachmentTypes={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','application/pdf':'pdf'}as const;
export type TaskAttachmentMime=keyof typeof taskAttachmentTypes;
/** Matches the existing managed-receipt filename rules without importing Node
 * crypto into the browser; names never choose a storage path. */
export function normalizeTaskAttachmentName(value:unknown,mime:TaskAttachmentMime):string {
 if(typeof value!=='string'||!value.trim()||value.length>200||!Object.hasOwn(taskAttachmentTypes,mime))throw Error('Invalid task attachment name');const name=value.normalize('NFC');if(new TextDecoder().decode(new TextEncoder().encode(name))!==name||name!==name.trim()||/[<>:"/\\|?*\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(name)||/[. ]$/.test(name)||/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name))throw Error('Invalid task attachment name');const extension=taskAttachmentTypes[mime],dot=name.lastIndexOf('.');if(dot===0)throw Error('Invalid task attachment name');if(dot<0){const completed=name+'.'+extension;if(completed.length>200)throw Error('Invalid task attachment name');return completed;}const suffix=name.slice(dot+1).toLowerCase();if(suffix!==extension&&!(mime==='image/jpeg'&&suffix==='jpeg'))throw Error('Misleading task attachment extension');return name;
}
