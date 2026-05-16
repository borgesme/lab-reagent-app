import { describe, it, expect, beforeEach } from 'vitest';
import { useWxCapsuleRect } from '@/hooks/useWxCapsuleRect';

beforeEach(() => {
  delete (uni as any).getMenuButtonBoundingClientRect;
  delete (globalThis as any).wx;
});

describe('useWxCapsuleRect', () => {
  it('无胶囊 API（H5） → rect=null，navBarHeight 走 statusBar+44 兜底', () => {
    const { rect, navBarHeight, avoidCapsuleStyle } = useWxCapsuleRect();
    expect(rect.value).toBeNull();
    expect(navBarHeight.value).toBe(64);
    expect(avoidCapsuleStyle.value).toEqual({});
  });

  it('微信端 → 拿到 rect，生成 padding 与对齐样式', () => {
    (uni as any).getMenuButtonBoundingClientRect = () => ({
      top: 24,
      right: 87,
      bottom: 56,
      left: 280,
      width: 87,
      height: 32,
    });
    const origin = uni.getSystemInfoSync as any;
    (uni.getSystemInfoSync as any) = () => ({
      statusBarHeight: 20,
      screenWidth: 375,
      windowWidth: 375,
      language: 'zh-CN',
      platform: 'devtools',
      safeAreaInsets: { top: 20, bottom: 0, left: 0, right: 0 },
    });
    try {
      const { rect, capsuleRightSpace, avoidCapsuleStyle, alignRightElementStyle } =
        useWxCapsuleRect();
      expect(rect.value?.top).toBe(24);
      expect(capsuleRightSpace.value).toBe(95);
      expect(avoidCapsuleStyle.value.paddingTop).toBe('24px');
      expect(alignRightElementStyle.value.position).toBe('absolute');
    } finally {
      (uni.getSystemInfoSync as any) = origin;
    }
  });
});
