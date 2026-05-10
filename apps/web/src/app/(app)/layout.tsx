import { RequireAuth } from '@/components/RequireAuth';
import { AppShell } from '@/components/shell/AppShell';
import { Toaster } from '@/components/ui/sonner';
import { QueryProvider } from './QueryProvider';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <QueryProvider>
        <AppShell>{children}</AppShell>
        <Toaster richColors position="top-right" />
      </QueryProvider>
    </RequireAuth>
  );
}
