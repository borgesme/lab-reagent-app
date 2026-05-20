import './globals.css';
import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/theme-provider';
import { PaletteProvider } from '@/components/palette-provider';
import { PALETTE_NO_FLASH_SCRIPT } from '@/lib/palette-script';

export const metadata: Metadata = { title: '实验室试剂管理' };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: PALETTE_NO_FLASH_SCRIPT }}
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PaletteProvider>{children}</PaletteProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
