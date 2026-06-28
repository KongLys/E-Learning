import { QueryClient } from '@tanstack/react-query';

// Singleton QueryClient dùng chung cho cả ứng dụng (client-side).
// Tách ra khỏi Providers để auth.store có thể gọi queryClient.clear()
// khi chuyển phiên đăng nhập, tránh hiển thị dữ liệu của phiên cũ.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60 * 1000, retry: 1, refetchOnWindowFocus: false } },
});
