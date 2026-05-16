<template>
  <view class="page">
    <NavBar :title="$t('pageTitle.reportSummary')" showBack />
    <view class="content p-24">
      <view v-if="visibleCount === 0" class="empty">
        <u-empty :text="$t('report.noPermission')" />
      </view>

      <view v-if="canUsage" class="report-card">
        <text class="report-label">{{ usage.label }}</text>
        <view v-if="usage.loading" class="report-loading">
          <text class="muted">{{ $t('toast.loading') }}</text>
        </view>
        <view v-else-if="usage.error" class="report-error">
          <text class="error-text">{{ usage.error }}</text>
          <view class="mt-8">
            <u-button
              size="mini"
              :text="$t('common.retry')"
              @click="loadUsage"
            />
          </view>
        </view>
        <text v-else class="report-value">{{ usage.value || '—' }}</text>
      </view>

      <view v-if="canInv" class="report-card">
        <text class="report-label">{{ inv.label }}</text>
        <view v-if="inv.loading" class="report-loading">
          <text class="muted">{{ $t('toast.loading') }}</text>
        </view>
        <view v-else-if="inv.error" class="report-error">
          <text class="error-text">{{ inv.error }}</text>
          <view class="mt-8">
            <u-button
              size="mini"
              :text="$t('common.retry')"
              @click="loadInv"
            />
          </view>
        </view>
        <text v-else class="report-value">{{ inv.value || '—' }}</text>
      </view>

      <view v-if="canPurchase" class="report-card">
        <text class="report-label">{{ purchase.label }}</text>
        <view v-if="purchase.loading" class="report-loading">
          <text class="muted">{{ $t('toast.loading') }}</text>
        </view>
        <view v-else-if="purchase.error" class="report-error">
          <text class="error-text">{{ purchase.error }}</text>
          <view class="mt-8">
            <u-button
              size="mini"
              :text="$t('common.retry')"
              @click="loadPurchase"
            />
          </view>
        </view>
        <text v-else class="report-value">{{ purchase.value || '—' }}</text>
      </view>
    </view>
    <CustomBottomArea />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import NavBar from '@/components/nav-bar/nav-bar.vue';
import CustomBottomArea from '@/components/custom-bottom-area/custom-bottom-area.vue';
import { useAuth } from '@/stores/auth';
import * as reportsApi from '@/api/modules/reports';
import { i18n } from '@/locale';
import {
  REPORT_SCOPE_MATRIX,
  type ReportType,
  type RoleCode,
} from '@app/shared';

interface CardState {
  label: string;
  value: string;
  loading: boolean;
  error: string | null;
}

const auth = useAuth();
const roles = computed<RoleCode[]>(() => (auth.user?.roles ?? []) as RoleCode[]);

function can(slug: ReportType) {
  return roles.value.some((r) => REPORT_SCOPE_MATRIX[r]?.[slug] != null);
}

const canUsage = computed(() => can('usage-trend'));
const canInv = computed(() => can('inventory-turnover'));
const canPurchase = computed(() => can('purchase-amount'));
const visibleCount = computed(
  () =>
    Number(canUsage.value) + Number(canInv.value) + Number(canPurchase.value),
);

const usage = reactive<CardState>({
  label: i18n.global.t('report.usageTrend'),
  value: '',
  loading: true,
  error: null,
});
const inv = reactive<CardState>({
  label: i18n.global.t('report.inventoryTurnover'),
  value: '',
  loading: true,
  error: null,
});
const purchase = reactive<CardState>({
  label: i18n.global.t('report.purchaseAmount'),
  value: '',
  loading: true,
  error: null,
});

async function loadUsage() {
  if (!canUsage.value) {
    usage.loading = false;
    return;
  }
  usage.loading = true;
  usage.error = null;
  try {
    const d: any = await reportsApi.usageTrend({ range: '30d', summary: 1 });
    usage.value = d?.summary?.totalIssued ?? '0';
  } catch (e: any) {
    usage.error = e?.message ?? i18n.global.t('toast.requestFailed');
  } finally {
    usage.loading = false;
  }
}

async function loadInv() {
  if (!canInv.value) {
    inv.loading = false;
    return;
  }
  inv.loading = true;
  inv.error = null;
  try {
    const d: any = await reportsApi.inventoryTurnover({
      range: '30d',
      summary: 1,
    });
    inv.value = String(d?.summary?.lowStockCount ?? '0');
  } catch (e: any) {
    inv.error = e?.message ?? i18n.global.t('toast.requestFailed');
  } finally {
    inv.loading = false;
  }
}

async function loadPurchase() {
  if (!canPurchase.value) {
    purchase.loading = false;
    return;
  }
  purchase.loading = true;
  purchase.error = null;
  try {
    const d: any = await reportsApi.purchaseAmount({
      range: 'month',
      groupBy: 'month',
      summary: 1,
    });
    purchase.value = d?.summary?.totalAmount ?? '0';
  } catch (e: any) {
    purchase.error = e?.message ?? i18n.global.t('toast.requestFailed');
  } finally {
    purchase.loading = false;
  }
}

function loadAll() {
  loadUsage();
  loadInv();
  loadPurchase();
}

onShow(() => loadAll());
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 120rpx;
}
.report-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-top: 16rpx;
}
.report-label {
  font-size: 26rpx;
  color: #6b7280;
}
.report-value {
  display: block;
  margin-top: 16rpx;
  font-size: 48rpx;
  font-weight: bold;
  color: #1f2937;
}
.report-loading {
  margin-top: 16rpx;
}
.report-error {
  margin-top: 16rpx;
}
.error-text {
  color: #d4380d;
  font-size: 26rpx;
}
.muted {
  color: #9ca3af;
  font-size: 26rpx;
}
.empty {
  display: flex;
  justify-content: center;
  padding: 96rpx 0;
}
</style>
