import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const OK_STATUSES = new Set(['ACTIVE', 'CONNECTED', 'RESOLVED', 'DONE', 'SUCCEEDED', 'APPROVED', 'VERIFIED', 'COMPLETE', 'UP', 'READY']);
const WARN_STATUSES = new Set(['PAUSED', 'PENDING', 'REVIEWED', 'REVIEW', 'IN_PROGRESS', 'VERIFYING', 'RUNNING', 'FIXED', 'DRAFT', 'TIMEOUT', 'PDF_FAILED', 'DOWN', 'NOT_READY']);
const BAD_STATUSES = new Set(['FAILED', 'REJECTED', 'IGNORED', 'ARCHIVED', 'BLOCKED', 'SUSPENDED']);

export function StatusBadge({ status }: { status: string }) {
  const upper = String(status ?? '').toUpperCase();
  const variant: 'default' | 'secondary' | 'outline' = BAD_STATUSES.has(upper)
    ? 'outline'
    : WARN_STATUSES.has(upper)
      ? 'secondary'
      : 'default';
  const tone = BAD_STATUSES.has(upper)
    ? 'border-destructive/40 text-destructive'
    : OK_STATUSES.has(upper)
      ? 'text-emerald-700'
      : '';
  return (
    <Badge variant={variant} className={cn(tone)}>
      {status}
    </Badge>
  );
}
