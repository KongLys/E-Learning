'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { DialogHost } from '@/components/common/DialogHost';
import { queryClient } from '@/lib/query-client';

export function Providers({ children }: { children: React.ReactNode }) {
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
