<template>
  <view class="tab-bar-wrap">
    <view class="tab-bar">
      <view
        v-for="(item, index) in items"
        :key="item.pagePath"
        class="tab-bar-item"
        :class="{ active: current === index }"
        @click="onTap(item, index)"
      >
        <u-icon
          :name="current === index ? item.activeIcon : item.icon"
          :color="current === index ? '#10b981' : '#909193'"
          size="22"
        />
        <text class="tab-text" :class="{ active: current === index }">
          {{ $t(item.i18nKey) }}
        </text>
      </view>
    </view>
    <view class="safe-area-inset-bottom" />
  </view>
</template>

<script setup lang="ts">
import { useLoginCheck } from '@/hooks/useLoginCheck';

interface TabItem {
  pagePath: string;
  icon: string;
  activeIcon: string;
  i18nKey: string;
  requireLogin: boolean;
}

interface Props {
  current: number;
}

const props = defineProps<Props>();

const { checkLogin } = useLoginCheck();

const items: TabItem[] = [
  {
    pagePath: '/pages/home/index',
    icon: 'home',
    activeIcon: 'home-fill',
    i18nKey: 'tabBar.home',
    requireLogin: false,
  },
  {
    pagePath: '/pages/my-requests/index',
    icon: 'file-text',
    activeIcon: 'file-text-fill',
    i18nKey: 'tabBar.myRequests',
    requireLogin: true,
  },
  {
    pagePath: '/pages/approvals/index',
    icon: 'checkmark-circle',
    activeIcon: 'checkmark-circle-fill',
    i18nKey: 'tabBar.approvals',
    requireLogin: true,
  },
  {
    pagePath: '/pages/notifications/index',
    icon: 'bell',
    activeIcon: 'bell-fill',
    i18nKey: 'tabBar.notifications',
    requireLogin: true,
  },
  {
    pagePath: '/pages/mine/index',
    icon: 'account',
    activeIcon: 'account-fill',
    i18nKey: 'tabBar.mine',
    requireLogin: true,
  },
];

function onTap(item: TabItem, index: number) {
  if (index === props.current) return;
  const go = () => uni.reLaunch({ url: item.pagePath });
  if (item.requireLogin) {
    checkLogin(go);
  } else {
    go();
  }
}
</script>

<style lang="scss" scoped>
.tab-bar-wrap {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 998;
  background: #ffffff;
  box-shadow: 0 -1px 0 rgba(0, 0, 0, 0.04);
}
.tab-bar {
  display: flex;
  align-items: stretch;
  height: 100rpx;
}
.tab-bar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
}
.tab-text {
  font-size: 22rpx;
  color: #909193;
}
.tab-text.active {
  color: #10b981;
  font-weight: 600;
}
.safe-area-inset-bottom {
  height: env(safe-area-inset-bottom);
}
</style>
