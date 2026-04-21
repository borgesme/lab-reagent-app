import { useState } from 'react';
import { useDidShow } from '@tarojs/taro';
import { View, Text, Button, Input } from '@tarojs/components';
import type {
  PurchaseBatchSummary,
  PurchaseRequestSummary,
  RequestSummary,
} from '@app/shared';
import { apiRequest } from '@/lib/api-client';

type ReqRow = RequestSummary & {
  reagent?: { name: string; hazardLevel?: string; controlType?: string | null };
  applicant?: { name: string };
};

type PurRow = PurchaseRequestSummary & {
  reagent?: { name: string } | null;
  applicant?: { name: string } | null;
  batch?: PurchaseBatchSummary | null;
};

type BatchGroup = { batch: PurchaseBatchSummary; items: PurRow[] };

export default function ApprovalsPage() {
  const [tab, setTab] = useState<'use' | 'purchase'>('use');
  const [reqs, setReqs] = useState<ReqRow[]>([]);
  const [groups, setGroups] = useState<Record<string, BatchGroup>>({});
  const [comment, setComment] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const [r, p] = await Promise.all([
        apiRequest<ReqRow[]>('/requests?status=PENDING'),
        apiRequest<PurRow[]>('/purchases'),
      ]);
      setReqs(r);
      const g: Record<string, BatchGroup> = {};
      for (const item of p) {
        if (!item.batch || item.batch.status !== 'PENDING') continue;
        if (!g[item.batch.id]) g[item.batch.id] = { batch: item.batch, items: [] };
        g[item.batch.id].items.push(item);
      }
      setGroups(g);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useDidShow(() => {
    refresh();
  });

  async function decideUse(
    id: string,
    action: 'APPROVE' | 'REJECT',
    level: 1 | 2,
  ) {
    try {
      await apiRequest(`/requests/${id}/approvals`, {
        method: 'POST',
        data: { action, level, comment: comment[id] ?? '' },
      });
      setComment((c) => ({ ...c, [id]: '' }));
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function decidePur(batchId: string, action: 'APPROVE' | 'REJECT') {
    try {
      await apiRequest(`/purchases/batches/${batchId}/approve`, {
        method: 'POST',
        data: { action, comment: comment[batchId] ?? '' },
      });
      setComment((c) => ({ ...c, [batchId]: '' }));
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <View style={{ padding: '24rpx' }}>
      <View style={{ display: 'flex' }}>
        <Button
          size="mini"
          type={tab === 'use' ? 'primary' : 'default'}
          onClick={() => setTab('use')}
        >
          领用
        </Button>
        <Button
          size="mini"
          type={tab === 'purchase' ? 'primary' : 'default'}
          onClick={() => setTab('purchase')}
          style={{ marginLeft: '12rpx' }}
        >
          采购
        </Button>
      </View>
      {err && (
        <Text style={{ color: '#d33', display: 'block', marginTop: '16rpx' }}>
          {err}
        </Text>
      )}

      {tab === 'use' && (
        <View style={{ marginTop: '16rpx' }}>
          {reqs.length === 0 && <Text style={{ color: '#888' }}>暂无待审批</Text>}
          {reqs.map((r) => {
            const ctrl =
              r.reagent?.hazardLevel === 'CONTROLLED' ||
              !!r.reagent?.controlType;
            return (
              <View
                key={r.id}
                style={{
                  padding: '16rpx',
                  border: '1rpx solid #eee',
                  borderRadius: '6rpx',
                  marginTop: '12rpx',
                }}
              >
                <Text style={{ fontWeight: 'bold' }}>
                  {r.reagent?.name ?? r.reagentId}
                  {ctrl ? '【管控】' : ''}
                </Text>
                <Text style={{ display: 'block', color: '#666' }}>
                  {r.applicant?.name ?? r.applicantId} · {r.quantity} {r.unit}
                </Text>
                <Text style={{ display: 'block', color: '#888' }}>
                  用途：{r.purpose}
                </Text>
                <Input
                  placeholder="备注/拒绝理由"
                  value={comment[r.id] ?? ''}
                  onInput={(e) =>
                    setComment({ ...comment, [r.id]: e.detail.value })
                  }
                  style={{
                    border: '1rpx solid #ccc',
                    padding: '10rpx',
                    marginTop: '8rpx',
                  }}
                />
                <View style={{ marginTop: '8rpx' }}>
                  <Button
                    size="mini"
                    type="primary"
                    onClick={() => decideUse(r.id, 'APPROVE', 1)}
                  >
                    一审通过
                  </Button>
                  <Button
                    size="mini"
                    onClick={() => decideUse(r.id, 'REJECT', 1)}
                    style={{ marginLeft: '8rpx' }}
                  >
                    一审拒绝
                  </Button>
                  {ctrl && (
                    <>
                      <Button
                        size="mini"
                        type="primary"
                        onClick={() => decideUse(r.id, 'APPROVE', 2)}
                        style={{ marginLeft: '8rpx' }}
                      >
                        二审通过
                      </Button>
                      <Button
                        size="mini"
                        onClick={() => decideUse(r.id, 'REJECT', 2)}
                        style={{ marginLeft: '8rpx' }}
                      >
                        二审拒绝
                      </Button>
                    </>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {tab === 'purchase' && (
        <View style={{ marginTop: '16rpx' }}>
          {Object.keys(groups).length === 0 && (
            <Text style={{ color: '#888' }}>暂无待审批批次</Text>
          )}
          {Object.entries(groups).map(([bid, g]) => (
            <View
              key={bid}
              style={{
                padding: '16rpx',
                border: '1rpx solid #eee',
                borderRadius: '6rpx',
                marginTop: '12rpx',
              }}
            >
              <Text style={{ fontWeight: 'bold' }}>批次 {bid}</Text>
              <Text style={{ display: 'block', color: '#666' }}>
                试剂 {g.batch.reagentId} · 总量 {g.batch.totalQty} {g.batch.unit}
              </Text>
              {g.items.map((i) => (
                <Text
                  key={i.id}
                  style={{ display: 'block', color: '#888' }}
                >
                  - {i.applicant?.name ?? i.applicantId}: {i.quantity} {i.unit}
                  （{i.reason}）
                </Text>
              ))}
              <Input
                placeholder="备注/拒绝理由"
                value={comment[bid] ?? ''}
                onInput={(e) =>
                  setComment({ ...comment, [bid]: e.detail.value })
                }
                style={{
                  border: '1rpx solid #ccc',
                  padding: '10rpx',
                  marginTop: '8rpx',
                }}
              />
              <View style={{ marginTop: '8rpx' }}>
                <Button
                  size="mini"
                  type="primary"
                  onClick={() => decidePur(bid, 'APPROVE')}
                >
                  通过
                </Button>
                <Button
                  size="mini"
                  onClick={() => decidePur(bid, 'REJECT')}
                  style={{ marginLeft: '8rpx' }}
                >
                  拒绝
                </Button>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
