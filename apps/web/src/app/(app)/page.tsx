import Link from 'next/link';

export default function Home() {
  return (
    <main className="p-8 space-y-3">
      <h1 className="text-2xl font-bold">实验室试剂管理系统</h1>
      <div className="flex flex-wrap gap-4">
        <Link href="/login" className="text-blue-600 underline">
          登录
        </Link>
        <Link href="/reagents" className="text-blue-600 underline">
          试剂百科
        </Link>
        <Link href="/my/requests" className="text-blue-600 underline">
          我的申请
        </Link>
        <Link href="/admin/users" className="text-blue-600 underline">
          管理后台
        </Link>
      </div>
    </main>
  );
}
