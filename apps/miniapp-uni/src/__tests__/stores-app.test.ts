import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia } from 'pinia';
import { pinia } from '@/stores';
import { useAppStore } from '@/stores/app';

describe('useAppStore', () => {
  beforeEach(() => {
    setActivePinia(pinia);
    const app = useAppStore();
    app.setSystemInfo({});
    app.setNavBarHeight(44);
    app.setTabBarHeight(50);
  });

  it('初始值：systemInfo {} / navBarHeight 44 / tabBarHeight 50', () => {
    const app = useAppStore();
    expect(app.systemInfo).toEqual({});
    expect(app.navBarHeight).toBe(44);
    expect(app.tabBarHeight).toBe(50);
  });

  it('setSystemInfo 写入后 computed 派生字段返回正确值', () => {
    const app = useAppStore();
    app.setSystemInfo({
      screenHeight: 800,
      safeAreaInsets: { top: 20, bottom: 34, left: 0, right: 0 },
    });
    expect(app.deviceScreenHeight).toBe(800);
    expect(app.safeAreaInsets).toEqual({
      top: 20,
      bottom: 34,
      left: 0,
      right: 0,
    });
    expect(app.safeAreaTop).toBe(20);
    expect(app.safeAreaBottom).toBe(34);
  });

  it('systemInfo 为空时 computed 返回 undefined（不再 .safeAreaInsets.top 崩）', () => {
    const app = useAppStore();
    expect(app.deviceScreenHeight).toBeUndefined();
    expect(app.safeAreaInsets).toBeUndefined();
    expect(app.safeAreaTop).toBeUndefined();
    expect(app.safeAreaBottom).toBeUndefined();
  });

  it('setNavBarHeight / setTabBarHeight 写入', () => {
    const app = useAppStore();
    app.setNavBarHeight(48);
    app.setTabBarHeight(56);
    expect(app.navBarHeight).toBe(48);
    expect(app.tabBarHeight).toBe(56);
  });

  it('persist 写入 mp.app.system / mp.app.layout 两个 key', () => {
    const app = useAppStore();
    app.setSystemInfo({
      screenHeight: 812,
      safeAreaInsets: { top: 44, bottom: 34, left: 0, right: 0 },
    });
    app.setNavBarHeight(48);
    app.setTabBarHeight(56);
    (app as any).$persist();
    const sys = uni.getStorageSync('mp.app.system');
    const layout = uni.getStorageSync('mp.app.layout');
    expect(sys).toContain('"screenHeight":812');
    expect(sys).toContain('"top":44');
    expect(layout).toContain('"navBarHeight":48');
    expect(layout).toContain('"tabBarHeight":56');
  });
});
