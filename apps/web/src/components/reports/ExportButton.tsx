'use client';
import { apiBaseUrl } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface Props {
  endpoint: string;
}

export function ExportButton({ endpoint }: Props) {
  const tokens = useAuth((s) => s.tokens);

  async function download(format: 'csv' | 'xlsx') {
    if (!tokens) return;
    const sep = endpoint.includes('?') ? '&' : '?';
    const res = await fetch(`${apiBaseUrl}${endpoint}${sep}format=${format}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    if (!res.ok) {
      alert(`导出失败:${res.status}`);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ??
      `report.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="inline-flex gap-2">
      <button
        className="rounded border px-3 py-1 text-sm"
        onClick={() => download('csv')}
      >
        导出 CSV
      </button>
      <button
        className="rounded border px-3 py-1 text-sm"
        onClick={() => download('xlsx')}
      >
        导出 Excel
      </button>
    </div>
  );
}
