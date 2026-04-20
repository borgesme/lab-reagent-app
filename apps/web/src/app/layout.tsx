import './globals.css';
import type { Metadata } from 'next';
import { NotificationBell } from '@/components/NotificationBell';

export const metadata: Metadata = { title: '实验室试剂管理' };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <NotificationBell />
        {children}
      </body>
    </html>
  );
}
