'use client';

interface Props {
  label: string;
  value: string | number;
  delta?: number;
}

export function KpiCard({ label, value, delta }: Props) {
  const trend = delta == null ? null : delta >= 0 ? 'up' : 'down';
  const color =
    trend == null ? '' : trend === 'up' ? 'text-green-600' : 'text-red-600';
  return (
    <div className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
      {delta != null && (
        <div className={`mt-1 text-xs ${color}`}>
          {delta >= 0 ? '+' : ''}
          {delta.toFixed(1)}% vs 上一周期
        </div>
      )}
    </div>
  );
}
