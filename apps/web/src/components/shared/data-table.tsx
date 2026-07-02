'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';

interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  emptyTitle?: string;
  getRowKey: (row: T) => string;
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  isError,
  onRetry,
  emptyTitle,
  getRowKey,
}: DataTableProps<T>) {
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={onRetry} />;
  if (!data?.length) return <EmptyState title={emptyTitle} />;

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className={col.className}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow key={getRowKey(row)}>
              {columns.map((col) => (
                <TableCell key={col.key} className={col.className}>
                  {col.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className="font-normal">
      {status}
    </Badge>
  );
}
