import { useState } from 'react';
import Taro from '@tarojs/taro';
import { View, Text, Input, Button } from '@tarojs/components';
import type { AuthTokens, UserSummary } from '@app/shared';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@lab.local');
  const [password, setPassword] = useState('admin123');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setSession = useAuth((s) => s.setSession);

  async function submit() {
    setLoading(true);
    setErr(null);
    try {
      const tokens = await apiRequest<AuthTokens>('/auth/login', {
        method: 'POST',
        data: { email, password },
      });
      // apiRequest reads tokens from auth-store; set them first so /auth/me sees the bearer
      setSession(tokens, {
        id: '',
        email,
        name: email,
        roles: [],
        labId: null,
      });
      const me = await apiRequest<UserSummary>('/auth/me');
      setSession(tokens, me);
      Taro.switchTab({ url: '/pages/home/index' });
    } catch (e: any) {
      setErr(e.message ?? '登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ padding: '48rpx' }}>
      <Text style={{ fontSize: '40rpx', fontWeight: 'bold' }}>实验室试剂</Text>
      <View style={{ marginTop: '32rpx' }}>
        <Text>邮箱</Text>
        <Input
          value={email}
          onInput={(e) => setEmail(e.detail.value)}
          placeholder="admin@lab.local"
          style={{
            border: '1rpx solid #ccc',
            padding: '12rpx',
            marginTop: '8rpx',
          }}
        />
      </View>
      <View style={{ marginTop: '16rpx' }}>
        <Text>密码</Text>
        <Input
          password
          value={password}
          onInput={(e) => setPassword(e.detail.value)}
          placeholder="admin123"
          style={{
            border: '1rpx solid #ccc',
            padding: '12rpx',
            marginTop: '8rpx',
          }}
        />
      </View>
      {err && (
        <View style={{ color: '#d33', marginTop: '16rpx' }}>
          <Text>{err}</Text>
        </View>
      )}
      <Button
        type="primary"
        loading={loading}
        onClick={submit}
        style={{ marginTop: '32rpx' }}
      >
        登录
      </Button>
    </View>
  );
}
