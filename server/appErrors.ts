export class AppStoreError extends Error {
  constructor(message: string, public status = 409, public code?: string) { super(message); }
}
export class AppDeliveryError extends Error {
  constructor(message: string, public unknownOutcome: boolean) { super(message); }
}

export interface EditVersionPayload { baseUpdatedAt?: string }
export function assertEditVersion(existing: { updatedAt?: string }, base: unknown): void {
  if (typeof base === 'string' && base && existing.updatedAt && existing.updatedAt !== base) {
    throw new AppStoreError('Bản ghi này vừa được người khác lưu trong lúc bạn đang mở form. Đóng form để xem nội dung mới nhất rồi sửa tiếp nhé.', 409, 'edit-conflict');
  }
}
export function httpErrorStatus(error: unknown, fallback = 400): number {
  const status = (error as { status?: unknown })?.status;
  return typeof status === 'number' && Number.isInteger(status) && status >= 400 && status < 500 ? status : fallback;
}
export function httpErrorBody(error: unknown): { error: string; conflict?: true } {
  return { error: error instanceof Error ? error.message : 'Không xử lý được yêu cầu.', ...((error as { code?: string })?.code === 'edit-conflict' ? { conflict: true as const } : {}) };
}
