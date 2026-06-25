'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useState } from 'react';
import { DialogHost } from '@/components/common/DialogHost';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60 * 1000, retry: 1 } },
  }));

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const content = (
    <QueryClientProvider client={queryClient}>
      {children}
      <DialogHost />
    </QueryClientProvider>
  );

  return googleClientId ? (
    <GoogleOAuthProvider clientId={googleClientId} locale="vi">
      {content}
    </GoogleOAuthProvider>
  ) : (
    content
  );
}
