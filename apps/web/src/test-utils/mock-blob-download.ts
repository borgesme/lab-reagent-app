/**
 * 共享的 Blob 下载 stub —— ExportButton 内部用 `URL.createObjectURL(blob)` + `URL.revokeObjectURL`
 * 触发浏览器下载。jsdom 在不同环境下对这两个 API 的支持不一致 (有时是 undefined，有时是 jsdom 内置)，
 * 直接 `vi.spyOn` 会在 undefined 情况下崩，直接 `URL.createObjectURL = vi.fn()` 又会污染下一个文件。
 *
 * 用法 (在测试文件):
 *   import { installBlobDownloadStub } from '@/test-utils/mock-blob-download';
 *   let restoreBlob: () => void;
 *   beforeEach(() => { restoreBlob = installBlobDownloadStub(); });
 *   afterEach(() => { restoreBlob(); });
 */
import { vi } from 'vitest';

export function installBlobDownloadStub(): () => void {
  const origCreate = (URL as any).createObjectURL as
    | ((b: Blob) => string)
    | undefined;
  const origRevoke = (URL as any).revokeObjectURL as
    | ((u: string) => void)
    | undefined;

  (URL as any).createObjectURL = vi.fn(() => 'blob:test');
  (URL as any).revokeObjectURL = vi.fn();

  return () => {
    if (origCreate === undefined) {
      delete (URL as any).createObjectURL;
    } else {
      (URL as any).createObjectURL = origCreate;
    }
    if (origRevoke === undefined) {
      delete (URL as any).revokeObjectURL;
    } else {
      (URL as any).revokeObjectURL = origRevoke;
    }
  };
}
