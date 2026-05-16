<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';
import { useBootTokenRefresh } from '@/hooks/useBootTokenRefresh';

onLaunch(() => {
  useBootTokenRefresh();
});

onShow(() => {});
onHide(() => {});
</script>

<style lang="scss">
@import '@/styles/index.scss';
</style>
