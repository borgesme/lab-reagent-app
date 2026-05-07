import { useState, useCallback } from 'react';
import { useDidShow } from '@tarojs/taro';
import { View, Text, Button } from '@tarojs/components';
import {
  REPORT_SCOPE_MATRIX,
  type ReportType,
  type RoleCode,
  type UsageTrendResponse,
  type InventoryTurnoverResponse,
  type PurchaseAmountResponse,
} from '@app/shared';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface CardState {
  label: string;
  value: string;
  loading: boolean;
  error: string | null;
}

const INITIAL: CardState = { label: '', value: '', loading: true, error: null };

export default function ReportSummaryPage() {
  const user = useAuth((s) => s.user);
  const roles = (user?.roles ?? []) as RoleCode[];

  const [usage, setUsage] = useState<CardState>({ ...INITIAL, label: '近 30 天领用量' });
  const [inv, setInv] = useState<CardState>({ ...INITIAL, label: '低库存数量' });
  const [purchase, setPurchase] = useState<CardState>({
    ...INITIAL,
    label: '本月采购金额',
  });

  const can = useCallback(
    (slug: ReportType) =>
      roles.some((r) => REPORT_SCOPE_MATRIX[r]?.[slug] != null),
    [roles],
  );

  async function loadUsage() {
    if (!can('usage-trend')) {
      setUsage((s) => ({ ...s, loading: false }));
      return;
    }
    setUsage((s) => ({ ...s, loading: true, error: null }));
    try {
      const d = await apiRequest<UsageTrendResponse>(
        '/reports/usage-trend?range=30d&summary=1',
      );
      setUsage({
        label: '近 30 天领用量',
        value: d.summary.totalIssued,
        loading: false,
        error: null,
      });
    } catch (e: any) {
      setUsage((s) => ({ ...s, loading: false, error: e.message ?? '加载失败' }));
    }
  }

  async function loadInv() {
    if (!can('inventory-turnover')) {
      setInv((s) => ({ ...s, loading: false }));
      return;
    }
    setInv((s) => ({ ...s, loading: true, error: null }));
    try {
      const d = await apiRequest<InventoryTurnoverResponse>(
        '/reports/inventory-turnover?range=30d&summary=1',
      );
      setInv({
        label: '低库存数量',
        value: String(d.summary.lowStockCount),
        loading: false,
        error: null,
      });
    } catch (e: any) {
      setInv((s) => ({ ...s, loading: false, error: e.message ?? '加载失败' }));
    }
  }

  async function loadPurchase() {
    if (!can('purchase-amount')) {
      setPurchase((s) => ({ ...s, loading: false }));
      return;
    }
    setPurchase((s) => ({ ...s, loading: true, error: null }));
    try {
      const d = await apiRequest<PurchaseAmountResponse>(
        '/reports/purchase-amount?range=month&groupBy=month&summary=1',
      );
      setPurchase({
        label: '本月采购金额(元)',
        value: d.summary.totalAmount,
        loading: false,
        error: null,
      });
    } catch (e: any) {
      setPurchase((s) => ({
        ...s,
        loading: false,
        error: e.message ?? '加载失败',
      }));
    }
  }

  function loadAll() {
    loadUsage();
    loadInv();
    loadPurchase();
  }

  useDidShow(() => {
    loadAll();
  });

  function renderCard(
    state: CardState,
    visible: boolean,
    retry: () => void,
  ) {
    if (!visible) return null;
    return (
      <View
        style={{
          marginTop: '24rpx',
          padding: '32rpx',
          border: '1rpx solid #ddd',
          borderRadius: '12rpx',
          background: '#fff',
        }}
      >
        <Text style={{ color: '#666', fontSize: '26rpx' }}>{state.label}</Text>
        {state.loading && (
          <Text style={{ display: 'block', marginTop: '16rpx', color: '#999' }}>
            加载中…
          </Text>
        )}
        {!state.loading && state.error && (
          <View style={{ marginTop: '16rpx' }}>
            <Text style={{ color: '#d4380d', fontSize: '26rpx' }}>
              {state.error}
            </Text>
            <Button
              size="mini"
              style={{ marginTop: '12rpx' }}
              onClick={retry}
            >
              点击重试
            </Button>
          </View>
        )}
        {!state.loading && !state.error && (
          <Text
            style={{
              display: 'block',
              marginTop: '16rpx',
              fontSize: '48rpx',
              fontWeight: 'bold',
            }}
          >
            {state.value || '—'}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={{ padding: '32rpx', background: '#f5f5f5', minHeight: '100vh' }}>
      <Text style={{ fontSize: '36rpx', fontWeight: 'bold' }}>报表概览</Text>
      {renderCard(usage, can('usage-trend'), loadUsage)}
      {renderCard(inv, can('inventory-turnover'), loadInv)}
      {renderCard(purchase, can('purchase-amount'), loadPurchase)}
    </View>
  );
}
