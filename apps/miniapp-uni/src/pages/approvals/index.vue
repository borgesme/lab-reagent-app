<template>
  <view class="page">
    <NavBar :title="$t('pageTitle.approvals')" />
    <view class="content p-24">
      <view class="tabs-bar">
        <u-tabs
          :list="tabsList"
          :current="tabIndex"
          lineColor="#10b981"
          :activeStyle="{ color: '#10b981', fontWeight: 600 }"
          :inactiveStyle="{ color: '#4b5563' }"
          @click="onTabClick"
        />
      </view>

      <view v-if="tab === 'use'" class="tab-pane mt-16">
        <Skeleton v-if="reqsLoading" :count="3" :rows="2" />
        <ErrorPlaceholder
          v-else-if="reqsError"
          :message="reqsError || undefined"
          @retry="refresh"
        />
        <view v-else-if="reqs.length === 0" class="empty">
          <u-empty :text="$t('common.empty')" />
        </view>
        <view v-else>
          <view v-for="r in reqs" :key="r.id" class="approval-card">
            <view class="row-between">
              <text class="approval-title">
                {{ r.reagent?.name ?? r.reagentId }}
                <text v-if="isControlled(r)" class="tag-controlled">
                  【{{ $t('approvals.controlled') }}】
                </text>
              </text>
            </view>
            <text class="approval-meta block">
              {{ r.applicant?.name ?? r.applicantId }} · {{ r.quantity }}
              {{ r.unit }}
            </text>
            <text class="approval-meta block">
              {{ $t('form.purpose') }}：{{ r.purpose }}
            </text>
            <u-textarea
              v-model="comments[r.id]"
              :placeholder="$t('approvals.remark')"
              :count="false"
              :autoHeight="true"
              class="mt-8"
            />
            <view class="btn-row mt-8">
              <u-button
                size="mini"
                type="primary"
                :text="$t('approvals.approve1')"
                @click="decideUse(r.id, 'APPROVE', 1)"
              />
              <u-button
                size="mini"
                :text="$t('approvals.reject1')"
                @click="decideUse(r.id, 'REJECT', 1)"
              />
              <template v-if="isControlled(r)">
                <u-button
                  size="mini"
                  type="primary"
                  :text="$t('approvals.approve2')"
                  @click="decideUse(r.id, 'APPROVE', 2)"
                />
                <u-button
                  size="mini"
                  :text="$t('approvals.reject2')"
                  @click="decideUse(r.id, 'REJECT', 2)"
                />
              </template>
            </view>
          </view>
        </view>
      </view>

      <view v-else class="tab-pane mt-16">
        <Skeleton v-if="purLoading" :count="3" :rows="2" />
        <ErrorPlaceholder
          v-else-if="purError"
          :message="purError || undefined"
          @retry="refresh"
        />
        <view v-else-if="batchList.length === 0" class="empty">
          <u-empty :text="$t('common.empty')" />
        </view>
        <view v-else>
          <view
            v-for="g in batchList"
            :key="g.batch.id"
            class="approval-card"
          >
            <text class="approval-title block">
              {{ $t('approvals.batch') }} {{ g.batch.id }}
            </text>
            <text class="approval-meta block">
              {{ $t('form.reagent') }} {{ g.batch.reagentId }} ·
              {{ g.batch.totalQty }} {{ g.batch.unit }}
            </text>
            <view class="batch-items">
              <text
                v-for="i in g.items"
                :key="i.id"
                class="batch-line block"
              >
                - {{ i.applicant?.name ?? i.applicantId }}: {{ i.quantity }}
                {{ i.unit }}（{{ i.reason }}）
              </text>
            </view>
            <u-textarea
              v-model="comments[g.batch.id]"
              :placeholder="$t('approvals.remark')"
              :count="false"
              :autoHeight="true"
              class="mt-8"
            />
            <view class="btn-row mt-8">
              <u-button
                size="mini"
                type="primary"
                :text="$t('common.approve')"
                @click="decideBatch(g.batch.id, 'APPROVE')"
              />
              <u-button
                size="mini"
                :text="$t('common.reject')"
                @click="decideBatch(g.batch.id, 'REJECT')"
              />
            </view>
          </view>
        </view>
      </view>
    </view>
    <TabBar :current="2" />
    <CustomBottomArea />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import NavBar from '@/components/nav-bar/nav-bar.vue';
import TabBar from '@/components/tab-bar/tab-bar.vue';
import CustomBottomArea from '@/components/custom-bottom-area/custom-bottom-area.vue';
import * as requestsApi from '@/api/modules/requests';
import * as purchasesApi from '@/api/modules/purchases';
import Skeleton from '@/components/skeleton/skeleton.vue';
import ErrorPlaceholder from '@/components/error-placeholder/error-placeholder.vue';
import { i18n } from '@/locale';

interface Reagent {
  name: string;
  hazardLevel?: string;
  controlType?: string | null;
}
interface ReqRow {
  id: string;
  applicantId: string;
  reagentId: string;
  quantity: string;
  unit: string;
  purpose: string;
  reagent?: Reagent;
  applicant?: { name: string };
}
interface PurchaseBatch {
  id: string;
  labId: string;
  reagentId: string;
  totalQty: string;
  unit: string;
  status: string;
}
interface PurRow {
  id: string;
  applicantId: string;
  reagentId: string;
  quantity: string;
  unit: string;
  reason: string;
  reagent?: { name: string } | null;
  applicant?: { name: string } | null;
  batch?: PurchaseBatch | null;
}
interface BatchGroup {
  batch: PurchaseBatch;
  items: PurRow[];
}

const tab = ref<'use' | 'purchase'>('use');
const tabsList = computed(() => [
  { name: i18n.global.t('approvals.useTab') },
  { name: i18n.global.t('approvals.purchaseTab') },
]);
const tabIndex = computed(() => (tab.value === 'use' ? 0 : 1));
function onTabClick(item: any) {
  tab.value = item.index === 0 ? 'use' : 'purchase';
}

const reqsLoading = ref(true);
const reqsError = ref<string | null>(null);
const purLoading = ref(true);
const purError = ref<string | null>(null);
const reqs = ref<ReqRow[]>([]);
const groups = ref<Record<string, BatchGroup>>({});
const comments = reactive<Record<string, string>>({});

const batchList = computed(() => Object.values(groups.value));

function isControlled(r: ReqRow) {
  return (
    r.reagent?.hazardLevel === 'CONTROLLED' || !!r.reagent?.controlType
  );
}

async function refresh() {
  reqsLoading.value = true;
  reqsError.value = null;
  purLoading.value = true;
  purError.value = null;
  try {
    const [r, p] = await Promise.all([
      requestsApi.listPending(),
      purchasesApi.listPending(),
    ]);
    reqs.value = (r as ReqRow[]) ?? [];
    const g: Record<string, BatchGroup> = {};
    for (const item of (p as PurRow[]) ?? []) {
      if (!item.batch || item.batch.status !== 'PENDING') continue;
      if (!g[item.batch.id]) g[item.batch.id] = { batch: item.batch, items: [] };
      g[item.batch.id].items.push(item);
    }
    groups.value = g;
  } catch (e: any) {
    const msg = e?.message ?? '加载失败';
    reqsError.value = msg;
    purError.value = msg;
  } finally {
    reqsLoading.value = false;
    purLoading.value = false;
    try {
      uni.stopPullDownRefresh();
    } catch {
      /* H5 无此 API */
    }
  }
}

async function decideUse(
  id: string,
  action: 'APPROVE' | 'REJECT',
  level: 1 | 2,
) {
  try {
    await requestsApi.decide(id, {
      action,
      level,
      comment: comments[id] ?? '',
    });
    comments[id] = '';
    await refresh();
  } catch {
    /* 401 已 toast */
  }
}

async function decideBatch(batchId: string, action: 'APPROVE' | 'REJECT') {
  try {
    await purchasesApi.decideBatch(batchId, {
      action,
      comment: comments[batchId] ?? '',
    });
    comments[batchId] = '';
    await refresh();
  } catch {
    /* 401 已 toast */
  }
}

onShow(() => refresh());
onPullDownRefresh(() => refresh());
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 120rpx;
}
.tabs-bar {
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
}
.approval-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-top: 16rpx;
}
.row-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.approval-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2937;
}
.tag-controlled {
  color: #ef4444;
  font-weight: normal;
  font-size: 24rpx;
}
.approval-meta {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #4b5563;
}
.batch-items {
  margin-top: 8rpx;
  padding: 8rpx 0;
}
.batch-line {
  font-size: 24rpx;
  color: #6b7280;
}
.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.block {
  display: block;
}
.empty {
  display: flex;
  justify-content: center;
  padding: 64rpx 0;
}
</style>
