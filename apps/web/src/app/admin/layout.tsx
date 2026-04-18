import Link from 'next/link';
import { RequireAuth } from '@/components/RequireAuth';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <div className="flex min-h-screen">
        <aside className="w-48 bg-gray-100 p-4 space-y-2">
          <Link href="/admin/users" className="block">
            用户
          </Link>
          <Link href="/admin/labs" className="block">
            实验室
          </Link>
          <Link href="/admin/roles" className="block">
            角色
          </Link>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </RequireAuth>
  );
}
