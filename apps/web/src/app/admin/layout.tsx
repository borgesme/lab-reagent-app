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
          <Link href="/reagents" className="block">
            试剂
          </Link>
          <Link href="/admin/stocks" className="block">
            库存
          </Link>
          <Link href="/approvals" className="block">
            审批
          </Link>
          <Link href="/admin/issues" className="block">
            发放
          </Link>
          <Link href="/admin/ledger" className="block">
            台账
          </Link>
          <Link href="/admin/purchases" className="block">
            采购
          </Link>
          <Link href="/admin/alerts/config" className="block">
            预警配置
          </Link>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </RequireAuth>
  );
}
