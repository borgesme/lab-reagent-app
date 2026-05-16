import { computed, ref } from 'vue';

interface CapsuleRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export function useWxCapsuleRect() {
  const rect = ref<CapsuleRect | null>(null);
  const statusBarHeight = ref(0);
  const screenWidth = ref(0);

  function update() {
    try {
      const si = uni.getSystemInfoSync();
      statusBarHeight.value = si.statusBarHeight ?? 0;
      screenWidth.value = (si.screenWidth ?? si.windowWidth) ?? 0;
    } catch {
      /* fallback */
    }
    let r: CapsuleRect | null = null;
    try {
      if (typeof (uni as any).getMenuButtonBoundingClientRect === 'function') {
        r = (uni as any).getMenuButtonBoundingClientRect();
      } else if (typeof (globalThis as any).wx?.getMenuButtonBoundingClientRect === 'function') {
        r = (globalThis as any).wx.getMenuButtonBoundingClientRect();
      }
    } catch {
      r = null;
    }
    rect.value = r;
  }

  update();

  const navBarHeight = computed(() => {
    if (!rect.value) return 44 + statusBarHeight.value;
    return rect.value.height + (rect.value.top - statusBarHeight.value) * 2;
  });

  const capsuleLeft = computed(() => rect.value?.left ?? 0);
  const capsuleRightSpace = computed(() =>
    rect.value && screenWidth.value ? screenWidth.value - rect.value.left : 0,
  );

  const avoidCapsuleStyle = computed(() => {
    if (!rect.value) return {} as Record<string, string>;
    return {
      paddingTop: `${rect.value.top}px`,
      paddingRight: `${capsuleRightSpace.value}px`,
    };
  });

  const alignRightElementStyle = computed(() => {
    if (!rect.value) return {} as Record<string, string>;
    return {
      position: 'absolute',
      top: `${rect.value.top}px`,
      right: `${capsuleRightSpace.value}px`,
      height: `${rect.value.height}px`,
    };
  });

  return {
    rect,
    statusBarHeight,
    screenWidth,
    navBarHeight,
    capsuleLeft,
    capsuleRightSpace,
    avoidCapsuleStyle,
    alignRightElementStyle,
    update,
  };
}
