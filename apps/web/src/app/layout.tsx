import type { Metadata } from 'next';
import { Inter, EB_Garamond } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-inter',
  display: 'swap',
});

const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-eb-garamond',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ELearn — Học online mọi lúc mọi nơi',
  description: 'Nền tảng học trực tuyến với hàng trăm khóa học chất lượng cao',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${inter.variable} ${ebGaramond.variable}`}>
      <body className="min-h-screen flex flex-col bg-canvas text-ink font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
