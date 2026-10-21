import { OrderSideBadge } from '@/components/common/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatNumber, formatPercent } from '@/lib/format';
import { formatClientDateTime } from '@/lib/time';
import type { TradeRecord } from '../stats';

/** Most recent filled orders, newest first. */
export function TradesTable({ trades, limit = 50 }: { trades: TradeRecord[]; limit?: number }) {
  const recent = trades.slice(-limit).reverse();

  return (
    <Table>
      <TableHeader className="bg-muted/60">
        <TableRow>
          {['Time', 'Side', 'Type', 'Price', 'Quantity', 'Value', 'Profit'].map((column) => (
            <TableHead key={column} className="label-style">
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody className="tabular-nums">
        {recent.map((trade, index) => (
          <TableRow key={`${trade.id}-${index}`}>
            <TableCell className="font-medium text-muted-foreground">
              {formatClientDateTime(trade.time)}
            </TableCell>
            <TableCell>
              <OrderSideBadge side={trade.side} />
            </TableCell>
            <TableCell className="font-medium">{trade.type}</TableCell>
            <TableCell>${formatNumber(trade.price, 2)}</TableCell>
            <TableCell>{formatNumber(trade.quantity, 6)}</TableCell>
            <TableCell className="font-medium">${formatNumber(trade.price * trade.quantity, 2)}</TableCell>
            <TableCell>
              {trade.profit !== undefined ? (
                <Badge variant={trade.profit >= 0 ? 'success' : 'danger'} className="font-bold">
                  {formatPercent(trade.profit)}
                </Badge>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
