import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import { View, Text, Input, Button } from '@tarojs/components';
import type { ReagentSummary } from '@app/shared';
import { apiRequest } from '@/lib/api-client';

export default function SearchPage() {
  const [keyword, setKeyword] = useState('');
  const [items, setItems] = useState<ReagentSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function search(q: string) {
    setErr(null);
    try {
      const path = q ? `/reagents?q=${encodeURIComponent(q)}` : '/reagents';
      const data = await apiRequest<ReagentSummary[]>(path);
      setItems(data);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    const router = Taro.getCurrentInstance().router;
    const q = (router?.params?.q as string | undefined) ?? '';
    setKeyword(q);
    search(q);
  }, []);

  return (
    <View style={{ padding: '24rpx' }}>
      <View style={{ display: 'flex', alignItems: 'center' }}>
        <Input
          value={keyword}
          onInput={(e) => setKeyword(e.detail.value)}
          placeholder="试剂名称关键词"
          style={{
            flex: 1,
            border: '1rpx solid #ccc',
            padding: '12rpx',
          }}
        />
        <Button
          size="mini"
          type="primary"
          onClick={() => search(keyword.trim())}
          style={{ marginLeft: '12rpx' }}
        >
          搜索
        </Button>
      </View>

      {err && (
        <Text style={{ color: '#d33', display: 'block', marginTop: '16rpx' }}>
          {err}
        </Text>
      )}

      <View style={{ marginTop: '24rpx' }}>
        {items.length === 0 && (
          <Text style={{ color: '#888' }}>无结果</Text>
        )}
        {items.map((r) => (
          <View
            key={r.id}
            style={{
              padding: '16rpx',
              border: '1rpx solid #eee',
              marginBottom: '12rpx',
              borderRadius: '6rpx',
            }}
          >
            <Text style={{ fontWeight: 'bold' }}>{r.name}</Text>
            {r.cas && (
              <Text style={{ display: 'block', color: '#666' }}>
                CAS: {r.cas}
              </Text>
            )}
            <Text style={{ display: 'block', color: '#888' }}>
              等级：{r.hazardLevel}
              {r.controlType ? `（管控：${r.controlType}）` : ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
