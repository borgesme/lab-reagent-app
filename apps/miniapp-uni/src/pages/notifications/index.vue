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
onPullDownRefresh(() => list.fetchListRefresh());
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 120rpx;
}
.noti-card {
  background: #fafafa;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-top: 16rpx;
}
.noti-card.unread {
  background: #fffbe6;
}
.noti-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2937;
}
.noti-body {
  margin-top: 8rpx;
  font-size: 26rpx;
  color: #4b5563;
}
.noti-meta {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #9ca3af;
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
