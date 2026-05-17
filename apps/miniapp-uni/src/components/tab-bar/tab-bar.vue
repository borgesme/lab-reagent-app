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
@import '@/styles/tokens.scss';

/* 悬浮容器：左右内缩 + 适配底部安全区 */
.tab-bar-wrap {
  position: fixed;
  left: 24rpx;
  right: 24rpx;
  bottom: 0;
  padding-bottom: calc(constant(safe-area-inset-bottom) + 16rpx);
  padding-bottom: calc(env(safe-area-inset-bottom) + 16rpx);
  z-index: 998;
}

/* 苹果玻璃质感 pill bar */
.tab-bar {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  height: 112rpx;
  padding: 8rpx 12rpx;
  background: rgba(255, 255, 255, 0.72);
  border: 2rpx solid rgba(255, 255, 255, 0.9);
  border-radius: 56rpx;
  box-shadow:
    0 12rpx 32rpx rgba(16, 185, 129, 0.14),
    0 4rpx 12rpx rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(20rpx) saturate(180%);
  -webkit-backdrop-filter: blur(20rpx) saturate(180%);
}

.tab-bar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  border-radius: 40rpx;
  transition: transform 0.15s ease;
}

.tab-bar-item.active {
  transform: scale(1.06);
}

.tab-text {
  font-size: 22rpx;
  color: #909193;
}

.tab-text.active {
  color: $mp-color-primary;
  font-weight: 600;
}
</style>
