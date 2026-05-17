import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useMpUpdate } from '@/hooks/useMpUpdate';

describe('useMpUpdate', () => {
  let originalCanIUse: any;
  let originalGetUpdateManager: any;
  let originalShowModal: any;

  beforeEach(() => {
    originalCanIUse = (uni as any).canIUse;
    originalGetUpdateManager = (uni as any).getUpdateManager;
    originalShowModal = (uni as any).showModal;
  });

  afterEach(() => {
    (uni as any).canIUse = originalCanIUse;
    (uni as any).getUpdateManager = originalGetUpdateManager;
    (uni as any).showModal = originalShowModal;
  });

  it('canIUse=false → skip，不调用 getUpdateManager', () => {
    (uni as any).canIUse = vi.fn(() => false);
    (uni as any).getUpdateManager = vi.fn();
    useMpUpdate().checkUpdate();
    expect((uni as any).canIUse).toHaveBeenCalledWith('getUpdateManager');
    expect((uni as any).getUpdateManager).not.toHaveBeenCalled();
  });

  it('canIUse=true → 注册 onCheckForUpdate / onUpdateReady / onUpdateFailed 三个回调', () => {
    const onCheck = vi.fn();
    const onReady = vi.fn();
    const onFailed = vi.fn();
    (uni as any).canIUse = vi.fn(() => true);
    (uni as any).getUpdateManager = vi.fn(() => ({
      onCheckForUpdate: onCheck,
      onUpdateReady: onReady,
      onUpdateFailed: onFailed,
      applyUpdate: vi.fn(),
    }));
    useMpUpdate().checkUpdate();
    expect(onCheck).toHaveBeenCalledOnce();
    expect(onReady).toHaveBeenCalledOnce();
    expect(onFailed).toHaveBeenCalledOnce();
  });

  it('onUpdateReady 弹窗 confirm → 调用 applyUpdate', () => {
    let readyCb: (() => void) | undefined;
    const applyUpdate = vi.fn();
    (uni as any).canIUse = vi.fn(() => true);
    (uni as any).getUpdateManager = vi.fn(() => ({
      onCheckForUpdate: vi.fn(),
      onUpdateReady: (h: () => void) => {
        readyCb = h;
      },
      onUpdateFailed: vi.fn(),
      applyUpdate,
    }));
    (uni as any).showModal = vi.fn((opts: any) => {
      opts.success?.({ confirm: true });
    });
    useMpUpdate().checkUpdate();
    readyCb?.();
    expect(applyUpdate).toHaveBeenCalledOnce();
  });

  it('onUpdateReady 弹窗 cancel → 不调用 applyUpdate', () => {
    let readyCb: (() => void) | undefined;
    const applyUpdate = vi.fn();
    (uni as any).canIUse = vi.fn(() => true);
    (uni as any).getUpdateManager = vi.fn(() => ({
      onCheckForUpdate: vi.fn(),
      onUpdateReady: (h: () => void) => {
        readyCb = h;
      },
      onUpdateFailed: vi.fn(),
      applyUpdate,
    }));
    (uni as any).showModal = vi.fn((opts: any) => {
      opts.success?.({ confirm: false });
    });
    useMpUpdate().checkUpdate();
    readyCb?.();
    expect(applyUpdate).not.toHaveBeenCalled();
  });
});
