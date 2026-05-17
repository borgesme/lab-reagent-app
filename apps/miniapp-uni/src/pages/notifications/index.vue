<template>
  <view class="page">
    <NavBar :title="$t('pageTitle.notifications')">
      <template #right>
        <u-button
          size="mini"
          :text="$t('common.readAll')"
          @click="markAll"
        />
      </template>
    </NavBar>
    <view class="content p-24">
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
          v-for="n in list.dataList.value"
          :key="n.id"
          class="noti-card"
          :class="{ unread: !n.readAt }"
          @click="onTap(n)"
        >
          <text class="noti-title">{{ n.title }}</text>
          <text class="noti-body block">{{ n.body }}</text>
          <text class="noti-meta block">
            {{ formatDate(n.createdAt) }}{{ n.readAt ? ' · 已读' : '' }}
          </text>
        </view>
      </view>
    </view>
    <TabBar :current="3" />
    <CustomBottomArea />
  </view>
</template>

<script setup lang="ts">
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import NavBar from '@/components/nav-bar/nav-bar.vue';
import TabBar from '@/components/tab-bar/tab-bar.vue';
import CustomBottomArea from '@/components/custom-bottom-area/custom-bottom-area.vue';
import * as notificationsApi from '@/api/modules/notifications';
import Skeleton from '@/components/skeleton/skeleton.vue';
import ErrorPlaceholder from '@/components/error-placeholder/error-placeholder.vue';
import { useRefreshList } from '@/hooks/useRefreshList';

interface Notification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt?: string | null;
}

const list = useRefreshList<Notification>(() => notificationsApi.list(), {
  extract: (r: any) => ({
    records: r ?? [],
    total: r?.length ?? 0,
  }),
  pageSize: 9999,
});

async function onTap(n: Notification) {
  if (n.readAt) return;
  await notificationsApi.read(n.id);
  await list.fetchListRefresh();
}

async function markAll() {
  await notificationsApi.readAll();
  await list.fetchListRefresh();
}

function formatDate(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

onShow(() => list.fetchListRefresh());
onPullDownRefresh(async () => {
  await list.fetchListRefresh();
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
.noti-card {
  background: $mp-color-card-alt;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-3;
  margin-top: $mp-spacing-2;
}
.noti-card.unread {
  background: $mp-color-card-unread;
}
.noti-title {
  font-size: $mp-text-md;
  font-weight: 600;
  color: $mp-color-text-primary;
}
.noti-body {
  margin-top: $mp-spacing-1;
  font-size: $mp-text-base;
  color: $mp-color-text-secondary;
}
.noti-meta {
  margin-top: $mp-spacing-1;
  font-size: $mp-text-xs;
  color: $mp-color-text-muted;
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
