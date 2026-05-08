'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const [email, setEmail] = useState('admin@lab.local');
  const [password, setPassword] = useState('admin123');
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const res = await apiFetch<{
        accessToken: string;
        refreshToken: string;
      }>('/auth/login', { method: 'POST', body: { email, password } });
      const me = await apiFetch<{
        id: string;
        email: string;
        name: string;
        labId: string | null;
        roles: string[];
      }>('/auth/me', { token: res.accessToken });
      setSession(res, {
        id: me.id,
        email: me.email,
        name: me.name,
        labId: me.labId,
        roles: me.roles as any,
      });
      router.push('/admin/users');
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center">
      <form
        onSubmit={onSubmit}
        className="space-y-3 p-6 border rounded w-80"
      >
        <h2 className="text-xl font-bold">登录</h2>
        <input
          className="w-full border p-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="邮箱"
        />
        <input
          className="w-full border p-2"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码"
        />
        <button className="w-full bg-blue-600 text-white p-2">登录</button>
        {err && <p className="text-red-600 text-sm">{err}</p>}
      </form>
    </main>
  );
}
