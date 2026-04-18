'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

export default function UsersPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [users, setUsers] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiFetch<any[]>('/users', { token })
      .then(setUsers)
      .catch((e) => setErr(e.message));
  }, [token]);

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">用户管理</h2>
      {err && <p className="text-red-600">{err}</p>}
      <table className="w-full border">
        <thead>
          <tr className="bg-gray-50">
            <th className="p-2 text-left">邮箱</th>
            <th className="p-2 text-left">姓名</th>
            <th className="p-2 text-left">实验室</th>
            <th className="p-2 text-left">角色</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t">
              <td className="p-2">{u.email}</td>
              <td className="p-2">{u.name}</td>
              <td className="p-2">{u.lab?.name ?? '-'}</td>
              <td className="p-2">
                {u.roles?.map((r: any) => r.role.code).join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
