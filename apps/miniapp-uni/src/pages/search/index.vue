<template>
  <view class="page">
    <NavBar :title="$t('pageTitle.search')" showBack />
    <view class="content p-24">
      <view class="card">
        <u-search
          v-model="keyword"
          :placeholder="$t('pageTitle.search')"
          @search="onSearch"
          @clear="onClear"
        />
      </view>

      <view class="mt-24">
        <view v-if="list.loading.value === 'empty'" class="empty">
          <u-empty :text="$t('toast.noResults')" />
        </view>
        <view
          v-for="r in list.dataList.value"
          :key="r.id"
          class="reagent-card"
        >
          <view class="reagent-head">
            <text class="reagent-name">{{ r.name }}</text>
            <u-tag
              v-if="isControlled(r)"
              type="error"
              text="管控"
              plain
              size="mini"
            />
          </view>
          <text v-if="r.cas" class="reagent-meta block">CAS: {{ r.cas }}</text>
          <text class="reagent-meta block">等级: {{ r.hazardLevel }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import NavBar from '@/components/nav-bar/nav-bar.vue';
import * as reagentsApi from '@/api/modules/reagents';
import { useRefreshList } from '@/hooks/useRefreshList';

interface Reagent {
  id: string;
  name: string;
  cas?: string | null;
  hazardLevel: string;
  controlType?: string | null;
}

const keyword = ref('');

const list = useRefreshList<Reagent>(
  () => reagentsApi.list(keyword.value.trim() || undefined),
  {
    extract: (r: any) => ({
      records: r ?? [],
      total: r?.length ?? 0,
    }),
    pageSize: 9999,
  },
);

function isControlled(r: Reagent) {
  return r.hazardLevel === 'CONTROLLED' || !!r.controlType;
}

function onSearch() {
  list.fetchListRefresh();
}
function onClear() {
  keyword.value = '';
  list.fetchListRefresh();
}

onLoad((options: any) => {
  const q = options?.q;
  if (q) keyword.value = decodeURIComponent(q);
  list.fetchListRefresh();
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 16rpx 24rpx;
}
.reagent-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-top: 16rpx;
}
.reagent-head {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.reagent-name {
  font-size: 30rpx;
  font-weight: 600;
  color: #1f2937;
}
.reagent-meta {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #6b7280;
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
