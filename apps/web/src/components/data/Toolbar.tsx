import { cn } from '@/lib/utils';

export interface ToolbarProps {
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function Toolbar({ filters, actions, className }: ToolbarProps) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-center gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">{filters}</div>
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </div>
  );
}
