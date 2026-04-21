import { useState } from 'react';
import { useDidShow } from '@tarojs/taro';
import { View, Text, Button } from '@tarojs/components';
import type { NotificationSummary } from '@app/shared';
import { apiRequest } from '@/lib/api-client';

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const data = await apiRequest<NotificationSummary[]>('/notifications');
      setItems(data);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useDidShow(() => {
    refresh();
  });

  async function markOne(id: string) {
    try {
      await apiRequest(`/notifications/${id}/read`, { method: 'POST' });
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function markAll() {
    try {
      await apiRequest('/notifications/read-all', { method: 'POST' });
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <View style={{ padding: '24rpx' }}>
      <View
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: '32rpx', fontWeight: 'bold' }}>通知</Text>
        <Button size="mini" onClick={markAll}>
          全部已读
        </Button>
      </View>
      {err && (
        <Text style={{ color: '#d33', display: 'block', marginTop: '16rpx' }}>
          {err}
        </Text>
      )}
      <View style={{ marginTop: '16rpx' }}>
        {items.length === 0 && (
          <Text style={{ color: '#888' }}>暂无消息</Text>
        )}
        {items.map((n) => (
          <View
            key={n.id}
            onClick={() => !n.readAt && markOne(n.id)}
            style={{
              padding: '16rpx',
              border: '1rpx solid #eee',
              borderRadius: '6rpx',
              marginTop: '8rpx',
              background: n.readAt ? '#fafafa' : '#fffbe6',
            }}
          >
            <Text style={{ fontWeight: 'bold' }}>{n.title}</Text>
            <Text style={{ display: 'block', color: '#555' }}>{n.body}</Text>
            <Text style={{ display: 'block', color: '#999' }}>
              {new Date(n.createdAt).toLocaleString()}
              {n.readAt ? ' · 已读' : ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
