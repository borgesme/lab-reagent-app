import { useState } from 'react';
import Taro, { useDidShow } from '@tarojs/taro';
import { View, Text, Input, Button } from '@tarojs/components';
import type { NotificationSummary } from '@app/shared';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

export default function HomePage() {
  const user = useAuth((s) => s.user);
  const [unread, setUnread] = useState(0);
  const [keyword, setKeyword] = useState('');

  async function refresh() {
    try {
      const list = await apiRequest<NotificationSummary[]>(
        '/notifications?unreadOnly=true',
      );
      setUnread(list.length);
    } catch {
      // 未登录时 401 已自动跳转，无需处理
    }
  }

  useDidShow(() => {
    refresh();
  });

  function goSearch() {
    const q = keyword.trim();
    Taro.navigateTo({
      url: `/pages/search/index?q=${encodeURIComponent(q)}`,
    });
  }

  return (
    <View style={{ padding: '32rpx' }}>
      <Text style={{ fontSize: '36rpx', fontWeight: 'bold' }}>
        {user ? `你好，${user.name}` : '未登录'}
      </Text>
      {user && (
        <Text style={{ display: 'block', color: '#666', marginTop: '8rpx' }}>
          实验室 {user.labId ?? '未分配'}
        </Text>
      )}

      <View
        style={{
          marginTop: '32rpx',
          padding: '20rpx',
          border: '1rpx solid #ddd',
          borderRadius: '8rpx',
        }}
      >
        <Text style={{ fontWeight: 'bold' }}>搜索试剂</Text>
        <Input
          value={keyword}
          onInput={(e) => setKeyword(e.detail.value)}
          placeholder="试剂名称关键词"
          style={{
            border: '1rpx solid #ccc',
            padding: '12rpx',
            marginTop: '12rpx',
          }}
        />
        <Button
          type="primary"
          size="mini"
          onClick={goSearch}
          style={{ marginTop: '12rpx' }}
        >
          搜索
        </Button>
      </View>

      <View
        style={{
          marginTop: '24rpx',
          padding: '20rpx',
          border: '1rpx solid #ddd',
          borderRadius: '8rpx',
        }}
      >
        <Text style={{ fontWeight: 'bold' }}>未读消息：{unread}</Text>
        <Button
          size="mini"
          style={{ marginTop: '12rpx' }}
          onClick={() =>
            Taro.switchTab({ url: '/pages/notifications/index' })
          }
        >
          查看消息
        </Button>
      </View>

      <View
        style={{
          marginTop: '24rpx',
          padding: '20rpx',
          border: '1rpx solid #ddd',
          borderRadius: '8rpx',
        }}
      >
        <Text style={{ fontWeight: 'bold' }}>快捷入口</Text>
        <Button
          size="mini"
          style={{ marginTop: '12rpx' }}
          onClick={() => Taro.switchTab({ url: '/pages/my-requests/index' })}
        >
          我的申请
        </Button>
        <Button
          size="mini"
          style={{ marginTop: '12rpx' }}
          onClick={() => Taro.switchTab({ url: '/pages/approvals/index' })}
        >
          待办审批
        </Button>
        <Button
          size="mini"
          style={{ marginTop: '12rpx' }}
          onClick={() => Taro.navigateTo({ url: '/pages/report-summary/index' })}
        >
          报表概览
        </Button>
      </View>
    </View>
  );
}
