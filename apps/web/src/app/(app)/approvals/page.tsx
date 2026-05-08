'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { EmptyState } from '@/components/data/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface RequestItem {
  id: string;
  quantity: string;
  unit: string;
  purpose: string;
  createdAt: string;
  reagent: { name: string; hazardLevel?: string; controlType?: string | null };
  stock: { batchNo?: string | null };
  applicant: { name: string; email: string };
  projectRef?: string | null;
  useLocation?: string | null;
}

export default function ApprovalsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentById, setCommentById] = useState<Record<string, string>>({});

  async function refresh() {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch<RequestItem[]>('/requests?status=PENDING', { token });
      setItems(data);
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function decide(id: string, action: 'APPROVE' | 'REJECT', level: 1 | 2) {
    try {
      await apiFetch(`/requests/${id}/approvals`, {
        method: 'POST',
        token,
        body: { action, level, comment: commentById[id] },
      });
      setCommentById((m) => ({ ...m, [id]: '' }));
      toast.success(`${level === 1 ? '一审' : '二审'}${action === 'APPROVE' ? '通过' : '拒绝'}`);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? '审批失败');
    }
  }

  return (
    <div>
      <PageHeader title="待我审批" subtitle="待处理的试剂申请" />
      <main>
        {items.length === 0 && !loading ? (
          <EmptyState title="暂无待审批申请" />
        ) : (
          <ul className="space-y-3" data-testid="approvals-list">
            {items.map((r) => {
              const ctrl = r.reagent.hazardLevel === 'CONTROLLED' || !!r.reagent.controlType;
              return (
                <li key={r.id} data-testid="approval-row">
                  <Card className="p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{r.reagent.name}</span>
                          {ctrl && <Badge variant="destructive">管控</Badge>}
                          <span className="text-sm text-muted-foreground">
                            批号 {r.stock.batchNo ?? '—'}
                          </span>
                        </div>
                        <div className="text-sm">
                          {r.applicant.name}（{r.applicant.email}）· 申请 {r.quantity}
                          {r.unit}
                        </div>
                        <div className="text-sm">用途：{r.purpose}</div>
                        {ctrl && (
                          <div className="text-xs text-muted-foreground">
                            项目 {r.projectRef ?? '—'} · 地点 {r.useLocation ?? '—'}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {r.createdAt.slice(0, 16).replace('T', ' ')}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Textarea
                          className="w-64"
                          rows={2}
                          placeholder="批注（可选，拒绝时作为原因）"
                          value={commentById[r.id] ?? ''}
                          onChange={(e) =>
                            setCommentById((m) => ({ ...m, [r.id]: e.target.value }))
                          }
                        />
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            data-testid="approval-approve-l1"
                            size="sm"
                            onClick={() => decide(r.id, 'APPROVE', 1)}
                          >
                            一审通过
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => decide(r.id, 'REJECT', 1)}
                          >
                            一审拒绝
                          </Button>
                          {ctrl && (
                            <>
                              <Button size="sm" onClick={() => decide(r.id, 'APPROVE', 2)}>
                                二审通过
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => decide(r.id, 'REJECT', 2)}
                              >
                                二审拒绝
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
