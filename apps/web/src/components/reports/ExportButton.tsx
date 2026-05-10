'use client';
import * as React from 'react';
import { ChevronDown, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiFetchRaw } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

export interface ExportButtonProps {
  endpoint: string;
  testId?: string;
}

export function ExportButton({ endpoint, testId }: ExportButtonProps) {
  const tokens = useAuth((s) => s.tokens);
  const [downloading, setDownloading] = React.useState(false);

  async function download(format: 'csv' | 'xlsx') {
    if (!tokens) return;
    setDownloading(true);
    try {
      const sep = endpoint.includes('?') ? '&' : '?';
      const res = await apiFetchRaw(`${endpoint}${sep}format=${format}`, {
        token: tokens.accessToken,
      });
      if (!res.ok) {
        toast.error(`导出失败:HTTP ${res.status}`);
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
    } catch (e: any) {
      toast.error(e.message ?? '导出失败');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={downloading}
          data-testid={testId}
        >
          {downloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          导出
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => download('csv')}
          data-testid={testId ? testId + '-csv' : undefined}
        >
          导出 CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => download('xlsx')}
          data-testid={testId ? testId + '-xlsx' : undefined}
        >
          导出 Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
