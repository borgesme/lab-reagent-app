<template>
  <view class="page">
    <NavBar :title="$t('pageTitle.myRequests')" />
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

      <view v-if="tab === 'use'" class="tab-pane">
        <view class="card mt-16">
          <text class="form-title">{{ $t('myRequests.newUse') }}</text>
          <u-cell-group :border="false">
            <u-cell
              :title="$t('form.reagent')"
              :value="useReagent?.name || $t('form.selectReagent')"
              isLink
              @click="reagentPickerUseShow = true"
            />
            <u-cell
              :title="$t('form.batch')"
              :value="stockLabelUse || $t('form.selectBatch')"
              isLink
              @click="onOpenStockPicker"
            />
          </u-cell-group>
          <view v-if="controlled" class="controlled-hint">
            {{ $t('form.controlledHint') }}
          </view>
          <u-form labelPosition="top" :model="useForm" class="mt-16">
            <u-form-item :label="$t('form.quantity')">
              <u-input
                v-model="useForm.quantity"
                :placeholder="$t('form.quantity')"
                type="text"
              />
            </u-form-item>
            <u-form-item :label="$t('form.unit')">
              <u-input
                v-model="useForm.unit"
                :placeholder="$t('form.unit')"
              />
            </u-form-item>
            <u-form-item :label="$t('form.purpose')">
              <u-textarea
                v-model="useForm.purpose"
                :placeholder="$t('form.purpose')"
                :count="false"
                :autoHeight="true"
              />
            </u-form-item>
          </u-form>
          <view class="mt-16">
            <u-button
              type="primary"
              :text="$t('common.submit')"
              :loading="submitting"
              :disabled="controlled"
              @click="submitUse"
            />
          </view>
        </view>

        <view class="mt-16">
          <Skeleton v-if="reqList.loadingFlag.value" :count="3" :rows="2" />
          <ErrorPlaceholder
            v-else-if="reqList.loading.value === 'error'"
            :message="reqList.lastError.value || undefined"
            @retry="reqList.retry"
          />
          <view v-else-if="reqList.loading.value === 'empty'" class="empty">
            <u-empty :text="$t('common.empty')" />
          </view>
          <view v-else>
            <view
              v-for="r in reqList.dataList.value"
              :key="r.id"
              class="req-card"
            >
              <view class="row-between">
                <text class="req-name">{{ r.reagent?.name ?? r.reagentId }}</text>
                <text class="req-status" :class="`status-${r.status}`">
                  {{ r.status }}
                </text>
              </view>
              <text class="req-line block">{{ r.quantity }} {{ r.unit }}</text>
              <text v-if="r.purpose" class="req-line block">{{ r.purpose }}</text>
              <view v-if="r.status === 'PENDING'" class="mt-8">
                <u-button
                  size="mini"
                  :text="$t('common.cancel')"
                  @click="cancelUse(r.id)"
                />
              </view>
            </view>
          </view>
        </view>
      </view>

      <view v-else class="tab-pane">
        <view class="card mt-16">
          <text class="form-title">{{ $t('myRequests.newPurchase') }}</text>
          <u-cell-group :border="false">
            <u-cell
              :title="$t('form.reagent')"
              :value="purReagent?.name || $t('form.selectReagent')"
              isLink
              @click="reagentPickerPurShow = true"
            />
          </u-cell-group>
          <u-form labelPosition="top" :model="purForm" class="mt-16">
            <u-form-item :label="$t('form.quantity')">
              <u-input
                v-model="purForm.quantity"
                :placeholder="$t('form.quantity')"
              />
            </u-form-item>
            <u-form-item :label="$t('form.unit')">
              <u-input
                v-model="purForm.unit"
                :placeholder="$t('form.unit')"
              />
            </u-form-item>
            <u-form-item :label="$t('form.reason')">
              <u-textarea
                v-model="purForm.reason"
                :placeholder="$t('form.reason')"
                :count="false"
                :autoHeight="true"
              />
            </u-form-item>
          </u-form>
          <view class="mt-16">
            <u-button
              type="primary"
              :text="$t('common.submit')"
              :loading="submitting"
              @click="submitPurchase"
            />
          </view>
        </view>

        <view class="mt-16">
          <Skeleton v-if="purList.loadingFlag.value" :count="3" :rows="2" />
          <ErrorPlaceholder
            v-else-if="purList.loading.value === 'error'"
            :message="purList.lastError.value || undefined"
            @retry="purList.retry"
          />
          <view v-else-if="purList.loading.value === 'empty'" class="empty">
            <u-empty :text="$t('common.empty')" />
          </view>
          <view v-else>
            <view
              v-for="p in purList.dataList.value"
              :key="p.id"
              class="req-card"
            >
              <view class="row-between">
                <text class="req-name">{{ p.reagent?.name ?? p.reagentId }}</text>
                <text class="req-status" :class="`status-${p.status}`">
                  {{ p.status }}
                </text>
              </view>
              <text class="req-line block">{{ p.quantity }} {{ p.unit }}</text>
              <text v-if="p.reason" class="req-line block">{{ p.reason }}</text>
              <view v-if="p.status === 'PENDING'" class="mt-8">
                <u-button
                  size="mini"
                  :text="$t('common.cancel')"
                  @click="cancelPurchase(p.id)"
                />
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>
    <TabBar :current="1" />
    <CustomBottomArea />

    <u-picker
      :show="reagentPickerUseShow"
      :columns="[reagentNames]"
      @confirm="onReagentPickedUse"
      @cancel="reagentPickerUseShow = false"
      @close="reagentPickerUseShow = false"
    />

    <u-picker
      :show="stockPickerShow"
      :columns="[stockLabelsUse]"
      @confirm="onStockPicked"
      @cancel="stockPickerShow = false"
      @close="stockPickerShow = false"
    />

    <u-picker
      :show="reagentPickerPurShow"
      :columns="[reagentNames]"
      @confirm="onReagentPickedPur"
      @cancel="reagentPickerPurShow = false"
      @close="reagentPickerPurShow = false"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import NavBar from '@/components/nav-bar/nav-bar.vue';
import TabBar from '@/components/tab-bar/tab-bar.vue';
import CustomBottomArea from '@/components/custom-bottom-area/custom-bottom-area.vue';
import * as reagentsApi from '@/api/modules/reagents';
import * as stocksApi from '@/api/modules/stocks';
import * as requestsApi from '@/api/modules/requests';
import * as purchasesApi from '@/api/modules/purchases';
import Skeleton from '@/components/skeleton/skeleton.vue';
import ErrorPlaceholder from '@/components/error-placeholder/error-placeholder.vue';
import { useRefreshList } from '@/hooks/useRefreshList';
import { i18n } from '@/locale';

interface Reagent {
  id: string;
  name: string;
  hazardLevel: string;
  controlType?: string | null;
}
interface Stock {
  id: string;
  reagentId: string;
  batchNo?: string | null;
  currentQty: string;
  unit: string;
}

const tab = ref<'use' | 'purchase'>('use');
const tabsList = computed(() => [
  { name: i18n.global.t('myRequests.useTab') },
  { name: i18n.global.t('myRequests.purchaseTab') },
]);
const tabIndex = computed(() => (tab.value === 'use' ? 0 : 1));
function onTabClick(item: any) {
  tab.value = item.index === 0 ? 'use' : 'purchase';
}

const reagents = ref<Reagent[]>([]);
const stocks = ref<Stock[]>([]);
const submitting = ref(false);

const useForm = reactive({
  reagentId: '',
  stockId: '',
  quantity: '',
  unit: 'mL',
  purpose: '',
});
const purForm = reactive({
  reagentId: '',
  quantity: '',
  unit: 'mL',
  reason: '',
});

const useReagent = computed(() =>
  reagents.value.find((r) => r.id === useForm.reagentId),
);
const useStocks = computed(() =>
  stocks.value.filter(
    (s) => !useForm.reagentId || s.reagentId === useForm.reagentId,
  ),
);
const useStock = computed(() =>
  useStocks.value.find((s) => s.id === useForm.stockId),
);
const controlled = computed(() => {
  const r = useReagent.value;
  return !!r && (r.hazardLevel === 'CONTROLLED' || !!r.controlType);
});
const purReagent = computed(() =>
  reagents.value.find((r) => r.id === purForm.reagentId),
);

const reagentNames = computed(() => reagents.value.map((r) => r.name));
const stockLabelsUse = computed(() =>
  useStocks.value.map(
    (s) => `${s.batchNo ?? '无批号'} · 余 ${s.currentQty}${s.unit}`,
  ),
);
const stockLabelUse = computed(() => {
  const s = useStock.value;
  return s ? `${s.batchNo ?? '无批号'} · 余 ${s.currentQty}${s.unit}` : '';
});

const reagentPickerUseShow = ref(false);
const stockPickerShow = ref(false);
const reagentPickerPurShow = ref(false);

function onReagentPickedUse(e: { indexs: number[] }) {
  const idx = e.indexs[0] ?? 0;
  const r = reagents.value[idx];
  if (r) {
    useForm.reagentId = r.id;
    useForm.stockId = '';
  }
  reagentPickerUseShow.value = false;
}
function onOpenStockPicker() {
  if (!useForm.reagentId) {
    uni.showToast({
      title: i18n.global.t('form.selectReagent'),
      icon: 'none',
    });
    return;
  }
  stockPickerShow.value = true;
}
function onStockPicked(e: { indexs: number[] }) {
  const idx = e.indexs[0] ?? 0;
  const s = useStocks.value[idx];
  if (s) useForm.stockId = s.id;
  stockPickerShow.value = false;
}
function onReagentPickedPur(e: { indexs: number[] }) {
  const idx = e.indexs[0] ?? 0;
  const r = reagents.value[idx];
  if (r) purForm.reagentId = r.id;
  reagentPickerPurShow.value = false;
}

const reqList = useRefreshList<any>(() => requestsApi.listMine(), {
  extract: (r: any) => ({ records: r ?? [], total: r?.length ?? 0 }),
  pageSize: 9999,
});
const purList = useRefreshList<any>(() => purchasesApi.listMine(), {
  extract: (r: any) => ({ records: r ?? [], total: r?.length ?? 0 }),
  pageSize: 9999,
});

async function loadOptions() {
  try {
    const [rs, ss] = await Promise.all([
      reagentsApi.list(),
      stocksApi.list(),
    ]);
    reagents.value = (rs as Reagent[]) ?? [];
    stocks.value = (ss as Stock[]) ?? [];
  } catch {
    /* 401 已 toast */
  }
}

async function refreshAll() {
  await Promise.all([
    loadOptions(),
    reqList.fetchListRefresh(),
    purList.fetchListRefresh(),
  ]);
}

async function submitUse() {
  if (controlled.value) {
    uni.showToast({
      title: i18n.global.t('form.controlledHint'),
      icon: 'none',
    });
    return;
  }
  if (!useForm.reagentId) {
    uni.showToast({
      title: i18n.global.t('form.selectReagent'),
      icon: 'none',
    });
    return;
  }
  if (!useForm.stockId) {
    uni.showToast({
      title: i18n.global.t('form.selectBatch'),
      icon: 'none',
    });
    return;
  }
  submitting.value = true;
  try {
    await requestsApi.create({
      reagentId: useForm.reagentId,
      stockId: useForm.stockId,
      quantity: useForm.quantity,
      unit: useForm.unit,
      purpose: useForm.purpose,
    });
    uni.showToast({
      title: i18n.global.t('toast.success'),
      icon: 'success',
    });
    useForm.reagentId = '';
    useForm.stockId = '';
    useForm.quantity = '';
    useForm.unit = 'mL';
    useForm.purpose = '';
    await reqList.fetchListRefresh();
  } catch {
    /* 401 已 toast */
  } finally {
    submitting.value = false;
  }
}

async function cancelUse(id: string) {
  try {
    await requestsApi.cancel(id);
    await reqList.fetchListRefresh();
  } catch {
    /* 401 已 toast */
  }
}

async function submitPurchase() {
  if (!purForm.reagentId) {
    uni.showToast({
      title: i18n.global.t('form.selectReagent'),
      icon: 'none',
    });
    return;
  }
  submitting.value = true;
  try {
    await purchasesApi.create({
      reagentId: purForm.reagentId,
      quantity: purForm.quantity,
      unit: purForm.unit,
      reason: purForm.reason,
    });
    uni.showToast({
      title: i18n.global.t('toast.success'),
      icon: 'success',
    });
    purForm.reagentId = '';
    purForm.quantity = '';
    purForm.unit = 'mL';
    purForm.reason = '';
    await purList.fetchListRefresh();
  } catch {
    /* 401 已 toast */
  } finally {
    submitting.value = false;
  }
}

async function cancelPurchase(id: string) {
  try {
    await purchasesApi.cancel(id);
    await purList.fetchListRefresh();
  } catch {
    /* 401 已 toast */
  }
}

onShow(() => refreshAll());
onPullDownRefresh(async () => {
  await refreshAll();
  try {
    uni.stopPullDownRefresh();
  } catch {
    /* H5 无此 API */
  }
});
</script>

<style lang="scss" scoped>
@import '@/styles/tokens.scss';
.page {
  min-height: 100vh;
  background: $mp-color-bg;
  padding-bottom: 120rpx;
}
.tabs-bar {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  overflow: hidden;
}
.card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-3;
}
.form-title {
  font-size: $mp-text-lg;
  font-weight: 600;
  color: $mp-color-text-primary;
}
.controlled-hint {
  margin-top: 12rpx;
  font-size: $mp-text-sm;
  color: $mp-color-error;
}
.req-card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-3;
  margin-top: $mp-spacing-2;
}
.row-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.req-name {
  font-size: $mp-text-md;
  font-weight: 600;
  color: $mp-color-text-primary;
}
.req-status {
  font-size: $mp-text-xs;
  color: $mp-color-text-tertiary;
}
.status-PENDING {
  color: $mp-color-warn;
}
.status-APPROVED,
.status-ISSUED,
.status-CLOSED,
.status-MERGED {
  color: $mp-color-primary;
}
.status-REJECTED,
.status-CANCELLED {
  color: $mp-color-error;
}
.req-line {
  margin-top: $mp-spacing-1;
  font-size: $mp-text-sm;
  color: $mp-color-text-secondary;
}
.block {
  display: block;
}
.empty {
  display: flex;
  justify-content: center;
  padding: $mp-spacing-8 0;
}
</style>
