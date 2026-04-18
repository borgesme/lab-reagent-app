'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

export default function LabsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [labs, setLabs] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [building, setBuilding] = useState('');

  const refresh = () => apiFetch<any[]>('/labs', { token }).then(setLabs);

  useEffect(() => {
    if (token) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch('/labs', {
      method: 'POST',
      body: { name, building },
      token,
    });
    setName('');
    setBuilding('');
    refresh();
  }

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">实验室管理</h2>
      <form onSubmit={onCreate} className="flex gap-2 mb-4">
        <input
          className="border p-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名称"
        />
        <input
          className="border p-2"
          value={building}
          onChange={(e) => setBuilding(e.target.value)}
          placeholder="地点"
        />
        <button className="bg-blue-600 text-white px-4">新增</button>
      </form>
      <ul>
        {labs.map((l) => (
          <li key={l.id}>
            {l.name} — {l.building ?? '-'}
          </li>
        ))}
      </ul>
    </section>
  );
}
