import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppProviders } from '@/providers/app-providers';

const inter = Inter({ subsets: ['latin', 'vietnamese'] });

export const metadata: Metadata = {
  title: 'Marketing Auto AZ - Nền tảng marketing automation',
  description: 'SaaS marketing automation dành cho spa, thẩm mỹ và doanh nghiệp dịch vụ',
  icons: {
    icon: [{ url: '/favicon.png', type: 'image/png' }],
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
  openGraph: {
    title: 'Marketing Auto AZ',
    description: 'Nền tảng marketing automation',
    images: [{ url: '/brand/logo.png', width: 1024, height: 1024, alt: 'Marketing Auto AZ' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={inter.className}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
