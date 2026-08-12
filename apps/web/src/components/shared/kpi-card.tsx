import { Card, CardContent } from '@/components/ui/card';

export function KpiCard({ label, value, delta, trend }: { label: string; value: string | number; delta?: string; trend?: 'up' | 'down' | 'flat' }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        {delta ? (
          <div
            className={
              trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground'
            }
          >
            {delta}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
