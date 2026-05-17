<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';
import { useBootTokenRefresh } from '@/hooks/useBootTokenRefresh';
import { useAppStore } from '@/stores/app';

const appStore = useAppStore();

onLaunch(() => {
  console.log('App Launch')
  useBootTokenRefresh();

  // 获取设备系统信息
  const systemInfo = uni.getWindowInfo()
  appStore.setSystemInfo(systemInfo)
});

onShow(() => {});
onHide(() => {});
</script>

<style lang="scss">
@import '@/styles/index.scss';
</style>
