import axios from 'axios';

/**
 * Bóc thông điệp lỗi từ một lỗi bất kỳ (thường là lỗi axios từ backend).
 * Dùng thay cho pattern lặp lại `err?.response?.data?.message ?? '...'` với `err: any`.
 */
export function getApiErrorMessage(
  err: unknown,
  fallback = 'Có lỗi xảy ra',
): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: unknown } | undefined;
    const message = data?.message;
    if (typeof message === 'string' && message.trim()) return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
