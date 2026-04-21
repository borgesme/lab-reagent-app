import { useState } from 'react';
import { useDidShow } from '@tarojs/taro';
import { View, Text, Button, Input, Textarea, Picker } from '@tarojs/components';
import type {
  ReagentSummary,
  StockSummary,
  RequestSummary,
  PurchaseRequestSummary,
} from '@app/shared';
import { apiRequest } from '@/lib/api-client';

type ReqRow = RequestSummary & {
  reagent?: { name: string; hazardLevel?: string; controlType?: string | null };
};
type PurRow = PurchaseRequestSummary & {
  reagent?: { name: string } | null;
};

export default function MyRequestsPage() {
  const [tab, setTab] = useState<'use' | 'purchase'>('use');
  const [reqs, setReqs] = useState<ReqRow[]>([]);
  const [purs, setPurs] = useState<PurRow[]>([]);
  const [reagents, setReagents] = useState<ReagentSummary[]>([]);
  const [stocks, setStocks] = useState<StockSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [useForm, setUseForm] = useState({
    reagentIdx: -1,
    stockIdx: -1,
    quantity: '',
    unit: 'mL',
    purpose: '',
  });

  const [purForm, setPurForm] = useState({
    reagentIdx: -1,
    quantity: '',
    unit: 'mL',
    reason: '',
  });

  async function refresh() {
    try {
      const [r, p, rs, st] = await Promise.all([
        apiRequest<ReqRow[]>('/requests'),
        apiRequest<PurRow[]>('/purchases/mine'),
        apiRequest<ReagentSummary[]>('/reagents'),
        apiRequest<StockSummary[]>('/stocks'),
      ]);
      setReqs(r);
      setPurs(p);
      setReagents(rs);
      setStocks(st);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useDidShow(() => {
    refresh();
  });

  const useReagent = reagents[useForm.reagentIdx];
  const useStocks = stocks.filter(
    (s) => !useReagent || s.reagentId === useReagent.id,
  );
  const controlled =
    useReagent &&
    (useReagent.hazardLevel === 'CONTROLLED' || !!useReagent.controlType);

  async function submitUse() {
    if (controlled) {
      setErr('管控试剂请到 Web 端提交完整信息');
      return;
    }
    const r = reagents[useForm.reagentIdx];
    const s = useStocks[useForm.stockIdx];
    if (!r || !s) {
      setErr('请选择试剂与批次');
      return;
    }
    try {
      await apiRequest('/requests', {
        method: 'POST',
        data: {
          reagentId: r.id,
          stockId: s.id,
          quantity: useForm.quantity,
          unit: useForm.unit,
          purpose: useForm.purpose,
        },
      });
      setUseForm({
        reagentIdx: -1,
        stockIdx: -1,
        quantity: '',
        unit: 'mL',
        purpose: '',
      });
      setErr(null);
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function submitPur() {
    const r = reagents[purForm.reagentIdx];
    if (!r) {
      setErr('请选择试剂');
      return;
    }
    try {
      await apiRequest('/purchases', {
        method: 'POST',
        data: {
          reagentId: r.id,
          quantity: purForm.quantity,
          unit: purForm.unit,
          reason: purForm.reason,
        },
      });
      setPurForm({ reagentIdx: -1, quantity: '', unit: 'mL', reason: '' });
      setErr(null);
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function cancelUse(id: string) {
    try {
      await apiRequest(`/requests/${id}/cancel`, { method: 'POST' });
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function cancelPur(id: string) {
    try {
      await apiRequest(`/purchases/${id}/cancel`, { method: 'POST' });
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
          领用申请
        </Button>
        <Button
          size="mini"
          type={tab === 'purchase' ? 'primary' : 'default'}
          onClick={() => setTab('purchase')}
          style={{ marginLeft: '12rpx' }}
        >
          采购申请
        </Button>
      </View>
      {err && (
        <Text style={{ color: '#d33', display: 'block', marginTop: '16rpx' }}>
          {err}
        </Text>
      )}

      {tab === 'use' && (
        <View style={{ marginTop: '16rpx' }}>
          <View
            style={{
              padding: '16rpx',
              border: '1rpx solid #ddd',
              borderRadius: '6rpx',
            }}
          >
            <Text style={{ fontWeight: 'bold' }}>新建领用申请</Text>
            <Picker
              mode="selector"
              range={reagents.map((r) => r.name)}
              value={useForm.reagentIdx >= 0 ? useForm.reagentIdx : 0}
              onChange={(e) =>
                setUseForm({
                  ...useForm,
                  reagentIdx: Number(e.detail.value),
                  stockIdx: -1,
                })
              }
            >
              <View style={{ marginTop: '12rpx' }}>
                试剂：{useReagent?.name ?? '点选'}
              </View>
            </Picker>
            {controlled && (
              <Text style={{ color: '#d33', display: 'block' }}>
                管控试剂请到 Web 端提交
              </Text>
            )}
            <Picker
              mode="selector"
              range={useStocks.map(
                (s) => `${s.batchNo ?? '无批号'} · 余 ${s.currentQty}${s.unit}`,
              )}
              value={useForm.stockIdx >= 0 ? useForm.stockIdx : 0}
              onChange={(e) =>
                setUseForm({ ...useForm, stockIdx: Number(e.detail.value) })
              }
            >
              <View style={{ marginTop: '12rpx' }}>
                批次：
                {useForm.stockIdx >= 0 && useStocks[useForm.stockIdx]
                  ? useStocks[useForm.stockIdx].batchNo ?? '无批号'
                  : '点选'}
              </View>
            </Picker>
            <Input
              placeholder="数量"
              value={useForm.quantity}
              onInput={(e) =>
                setUseForm({ ...useForm, quantity: e.detail.value })
              }
              style={{
                border: '1rpx solid #ccc',
                padding: '10rpx',
                marginTop: '12rpx',
              }}
            />
            <Input
              placeholder="单位"
              value={useForm.unit}
              onInput={(e) => setUseForm({ ...useForm, unit: e.detail.value })}
              style={{
                border: '1rpx solid #ccc',
                padding: '10rpx',
                marginTop: '12rpx',
              }}
            />
            <Textarea
              placeholder="用途"
              value={useForm.purpose}
              onInput={(e) =>
                setUseForm({ ...useForm, purpose: e.detail.value })
              }
              style={{
                border: '1rpx solid #ccc',
                padding: '10rpx',
                marginTop: '12rpx',
                width: '100%',
              }}
            />
            <Button
              type="primary"
              size="mini"
              style={{ marginTop: '12rpx' }}
              onClick={submitUse}
            >
              提交
            </Button>
          </View>

          <View style={{ marginTop: '16rpx' }}>
            {reqs.map((r) => (
              <View
                key={r.id}
                style={{
                  padding: '12rpx',
                  border: '1rpx solid #eee',
                  borderRadius: '6rpx',
                  marginTop: '8rpx',
                }}
              >
                <Text style={{ fontWeight: 'bold' }}>
                  {r.reagent?.name ?? r.reagentId}
                </Text>
                <Text style={{ display: 'block', color: '#666' }}>
                  {r.quantity} {r.unit} · {r.status}
                </Text>
                <Text style={{ display: 'block', color: '#888' }}>
                  {r.purpose}
                </Text>
                {r.status === 'PENDING' && (
                  <Button size="mini" onClick={() => cancelUse(r.id)}>
                    取消
                  </Button>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      {tab === 'purchase' && (
        <View style={{ marginTop: '16rpx' }}>
          <View
            style={{
              padding: '16rpx',
              border: '1rpx solid #ddd',
              borderRadius: '6rpx',
            }}
          >
            <Text style={{ fontWeight: 'bold' }}>新建采购申请</Text>
            <Picker
              mode="selector"
              range={reagents.map((r) => r.name)}
              value={purForm.reagentIdx >= 0 ? purForm.reagentIdx : 0}
              onChange={(e) =>
                setPurForm({ ...purForm, reagentIdx: Number(e.detail.value) })
              }
            >
              <View style={{ marginTop: '12rpx' }}>
                试剂：
                {reagents[purForm.reagentIdx]?.name ?? '点选'}
              </View>
            </Picker>
            <Input
              placeholder="数量"
              value={purForm.quantity}
              onInput={(e) =>
                setPurForm({ ...purForm, quantity: e.detail.value })
              }
              style={{
                border: '1rpx solid #ccc',
                padding: '10rpx',
                marginTop: '12rpx',
              }}
            />
            <Input
              placeholder="单位"
              value={purForm.unit}
              onInput={(e) =>
                setPurForm({ ...purForm, unit: e.detail.value })
              }
              style={{
                border: '1rpx solid #ccc',
                padding: '10rpx',
                marginTop: '12rpx',
              }}
            />
            <Textarea
              placeholder="理由"
              value={purForm.reason}
              onInput={(e) =>
                setPurForm({ ...purForm, reason: e.detail.value })
              }
              style={{
                border: '1rpx solid #ccc',
                padding: '10rpx',
                marginTop: '12rpx',
                width: '100%',
              }}
            />
            <Button
              type="primary"
              size="mini"
              style={{ marginTop: '12rpx' }}
              onClick={submitPur}
            >
              提交
            </Button>
          </View>

          <View style={{ marginTop: '16rpx' }}>
            {purs.map((p) => (
              <View
                key={p.id}
                style={{
                  padding: '12rpx',
                  border: '1rpx solid #eee',
                  borderRadius: '6rpx',
                  marginTop: '8rpx',
                }}
              >
                <Text style={{ fontWeight: 'bold' }}>
                  {p.reagent?.name ?? p.reagentId}
                </Text>
                <Text style={{ display: 'block', color: '#666' }}>
                  {p.quantity} {p.unit} · {p.status}
                </Text>
                <Text style={{ display: 'block', color: '#888' }}>
                  {p.reason}
                </Text>
                {p.status === 'PENDING' && (
                  <Button size="mini" onClick={() => cancelPur(p.id)}>
                    取消
                  </Button>
                )}
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
