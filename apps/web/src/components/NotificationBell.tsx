'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import type { NotificationSummary } from '@app/shared';

export function NotificationBell() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [items, setItems] = useState<NotificationSummary[]>([]);
  const [open, setOpen] = useState(false);

  async function refresh() {
    if (!token) {
      setItems([]);
      return;
    }
    try {
      const res = await apiFetch<NotificationSummary[]>(
        '/notifications?unreadOnly=true',
        { token },
      );
      setItems(res);
    } catch {
      // 未登录 / 网络错误忽略
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function markAll() {
    if (!token) return;
    await apiFetch('/notifications/read-all', { method: 'POST', token });
    setItems([]);
  }

  async function markOne(id: string) {
    if (!token) return;
    await apiFetch(`/notifications/${id}/read`, { method: 'POST', token });
    setItems((s) => s.filter((n) => n.id !== id));
  }

  if (!token) return null;

  return (
    <div className="fixed top-2 right-4 z-50">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative px-3 py-1 bg-white border rounded shadow"
      >
        🔔
        {items.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {items.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-80 bg-white border rounded shadow-lg max-h-96 overflow-auto">
          <div className="flex justify-between p-2 border-b">
            <span className="font-semibold">通知</span>
            <button className="text-blue-600 text-sm" onClick={markAll}>
              全部已读
            </button>
          </div>
          {items.length === 0 && (
            <div className="p-3 text-gray-500 text-sm">无新消息</div>
          )}
          {items.map((n) => (
            <div
              key={n.id}
              className="p-2 border-b hover:bg-gray-50 cursor-pointer"
              onClick={() => markOne(n.id)}
            >
              <div className="font-medium text-sm">{n.title}</div>
              <div className="text-xs text-gray-600">{n.body}</div>
              <div className="text-xs text-gray-400">
                {new Date(n.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
