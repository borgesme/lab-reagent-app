import Link from 'next/link';

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">实验室试剂管理系统</h1>
      <Link href="/login" className="text-blue-600 underline">
        登录
      </Link>
    </main>
  );
}
