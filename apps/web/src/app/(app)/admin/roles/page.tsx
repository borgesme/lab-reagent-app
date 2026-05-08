'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

export default function RolesPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [roles, setRoles] = useState<any[]>([]);
  useEffect(() => {
    if (!token) return;
    apiFetch<any[]>('/roles', { token }).then(setRoles);
  }, [token]);
  return (
    <section>
      <h2 className="text-xl font-bold mb-4">角色列表</h2>
      <ul>
        {roles.map((r) => (
          <li key={r.id}>
            {r.code} — {r.name}
          </li>
        ))}
      </ul>
    </section>
  );
}
