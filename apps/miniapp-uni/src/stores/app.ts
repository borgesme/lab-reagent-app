import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { uniStorage } from './persist.config';

type SystemInfo = Partial<UniApp.GetSystemInfoResult>;

export const useAppStore = defineStore(
  'app',
  () => {
    const systemInfo = ref<SystemInfo>({});
    const navBarHeight = ref(44);
    const tabBarHeight = ref(50);

    const deviceScreenHeight = computed(() => systemInfo.value.screenHeight);
    const safeAreaInsets = computed(() => systemInfo.value.safeAreaInsets);
    const safeAreaTop = computed(() => systemInfo.value.safeAreaInsets?.top);
    const safeAreaBottom = computed(
      () => systemInfo.value.safeAreaInsets?.bottom,
    );

    function setSystemInfo(data: SystemInfo) {
      systemInfo.value = data;
    }

    function setNavBarHeight(data: number) {
      navBarHeight.value = data;
    }

    function setTabBarHeight(data: number) {
      tabBarHeight.value = data;
    }

    return {
      systemInfo,
      navBarHeight,
      tabBarHeight,
      deviceScreenHeight,
      safeAreaInsets,
      safeAreaTop,
      safeAreaBottom,
      setSystemInfo,
      setNavBarHeight,
      setTabBarHeight,
    };
  },
  {
    persist: [
      {
        key: 'mp.app.system',
        storage: uniStorage,
        pick: ['systemInfo'],
      },
      {
        key: 'mp.app.layout',
        storage: uniStorage,
        pick: ['navBarHeight', 'tabBarHeight'],
      },
    ],
  },
);
