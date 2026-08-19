import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const VARIANTS = {
  default: 'border-transparent bg-primary text-primary-foreground',
  secondary: 'border-transparent bg-muted text-muted-foreground',
  outline: 'border border-input',
  paused: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  archived: 'border-transparent bg-zinc-100 text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400',
} as const;

type BadgeVariant = keyof typeof VARIANTS;

export interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

export const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium transition-colors',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  ),
);
Badge.displayName = 'Badge';
