import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from './empty-state';

export interface MetricTableRow {
  label: string;
  previous: string;
  current: string;
  delta: string;
  direction?: 'improved' | 'declined' | 'flat' | 'n/a';
}

export function MetricTable({ rows }: { rows: MetricTableRow[] }) {
  if (rows.length === 0) {
    return <EmptyState message="No comparable data yet." />;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Metric</TableHead>
          <TableHead>Previous</TableHead>
          <TableHead>Current</TableHead>
          <TableHead>Change</TableHead>
          <TableHead>Direction</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.label}>
            <TableCell className="font-medium">{row.label}</TableCell>
            <TableCell className="text-muted-foreground">{row.previous}</TableCell>
            <TableCell>{row.current}</TableCell>
            <TableCell>{row.delta}</TableCell>
            <TableCell className={row.direction === 'declined' ? 'text-destructive' : row.direction === 'improved' ? 'text-emerald-600' : 'text-muted-foreground'}>
              {row.direction ?? '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
