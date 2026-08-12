import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden="true" />;
}

export function PageLoader() {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}
