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
        <Skeleton v-if="list.loadingFlag.value" :count="3" :rows="2" />
        <ErrorPlaceholder
          v-else-if="list.loading.value === 'error'"
          :message="list.lastError.value || undefined"
          @retry="list.retry"
        />
        <view v-else-if="list.loading.value === 'empty'" class="empty">
          <u-empty :text="$t('common.empty')" />
        </view>
        <view v-else>
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
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import NavBar from '@/components/nav-bar/nav-bar.vue';
import * as reagentsApi from '@/api/modules/reagents';
import Skeleton from '@/components/skeleton/skeleton.vue';
import ErrorPlaceholder from '@/components/error-placeholder/error-placeholder.vue';
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
@import '@/styles/tokens.scss';
.page {
  min-height: 100vh;
  background: $mp-color-bg;
}
.card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-2 $mp-spacing-3;
}
.reagent-card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-3;
  margin-top: $mp-spacing-2;
}
.reagent-head {
  display: flex;
  align-items: center;
  gap: $mp-spacing-2;
}
.reagent-name {
  font-size: $mp-text-lg;
  font-weight: 600;
  color: $mp-color-text-primary;
}
.reagent-meta {
  margin-top: $mp-spacing-1;
  font-size: $mp-text-sm;
  color: $mp-color-text-tertiary;
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
