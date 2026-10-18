/** Task-only private download namespace; ordinary image/PDF media limits remain unchanged. */
export const maxTaskAttachmentBytes=20*1024*1024;
export const privateTaskAttachmentMediaPrefix='_task_files/';
export const taskAttachmentTypes={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','application/pdf':'pdf'}as const;
export type TaskAttachmentMime=keyof typeof taskAttachmentTypes;
