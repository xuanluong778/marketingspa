'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDateTime } from '@/lib/format';
import {
  useAdminBillingOrders,
  useAdminBillingSubscriptions,
  useAdminBillingTransactions,
  useAdminMarkReview,
  useAdminReprocessTransaction,
} from '@/hooks/use-billing';
import { LoadingState, ErrorState } from '@/components/shared/page-state';

type Tab = 'orders' | 'transactions' | 'subscriptions';

type TxRow = {
  id: string;
  transactionId: string;
  sepayTransactionId: string;
  amountVnd: number;
  matched: boolean;
  matchedReason: string | null;
  processingError: string | null;
  authMethod: string | null;
  authVerified: boolean;
  hmacVerified: boolean;
  createdAt: string;
  paymentOrder?: {
    code: string;
    status: string;
    plan?: { code: string; name: string; durationMonths: number };
    organization?: { name: string; email: string | null };
  } | null;
};

export default function AdminBillingPage() {
  const [tab, setTab] = useState<Tab>('orders');
  const [status, setStatus] = useState('');
  const [code, setCode] = useState('');
  const [transferContent, setTransferContent] = useState('');
  const [email, setEmail] = useState('');
  const [txQ, setTxQ] = useState('');
  const [txMatched, setTxMatched] = useState('');
  const [page, setPage] = useState(1);

  const ordersQ = useAdminBillingOrders({
    status,
    code,
    transferContent,
    email,
    page,
    pageSize: 20,
  });
  const transactionsQ = useAdminBillingTransactions({
    q: txQ,
    matched: txMatched,
    page,
    pageSize: 20,
  });
  const subQ = useAdminBillingSubscriptions(page);
  const reviewMut = useAdminMarkReview();
  const reprocessMut = useAdminReprocessTransaction();

  function reprocess(t: TxRow, force: boolean) {
    const reason = window.prompt(
      force
        ? `Đối soát FORCE kích hoạt ${t.sepayTransactionId}.\nLý do (bắt buộc):`
        : `Xử lý lại giao dịch ${t.sepayTransactionId}.\nLý do (bắt buộc):`,
    );
    if (!reason || reason.trim().length < 3) return;
    const before = `matched=${t.matched}, order=${t.paymentOrder?.code ?? '—'}, status=${t.paymentOrder?.status ?? '—'}`;
    if (
      !window.confirm(
        `${force ? 'FORCE ACTIVATE' : 'REPROCESS'}?\n${before}\nSau: matched=true + PAID (nếu hợp lệ)\nKhông cộng ngày lần hai nếu đã PAID.`,
      )
    ) {
      return;
    }
    reprocessMut.mutate(
      { id: t.id, reason: reason.trim(), force },
      {
        onSuccess: (r) =>
          window.alert(
            `Kết quả: ${(r as { result?: string }).result ?? 'ok'}\n${JSON.stringify((r as { before?: unknown; after?: unknown }).after ?? {}, null, 0)}`,
          ),
        onError: (e) => window.alert(e instanceof Error ? e.message : 'Lỗi'),
      },
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Thanh toán SePay</h2>
        <p className="text-sm text-muted-foreground">
          Đơn MKTA, giao dịch SePay, HMAC/API key, lỗi xử lý. Webhook idempotent theo
          transactionId — gửi trùng không kích hoạt lại.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['orders', 'Đơn hàng'],
            ['transactions', 'Giao dịch'],
            ['subscriptions', 'Subscription'],
          ] as const
        ).map(([k, label]) => (
          <Button
            key={k}
            size="sm"
            variant={tab === k ? 'default' : 'outline'}
            onClick={() => {
              setTab(k);
              setPage(1);
            }}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="PENDING">Chờ thanh toán</option>
              <option value="PAID">Thành công</option>
              <option value="EXPIRED">Hết hạn</option>
              <option value="CANCELLED">Đã hủy</option>
              <option value="REVIEW_REQUIRED">Cần kiểm tra</option>
            </select>
            <input
              className="h-9 rounded-md border bg-background px-3 text-sm"
              placeholder="Mã MKTA..."
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <input
              className="h-9 rounded-md border bg-background px-3 text-sm"
              placeholder="Nội dung CK"
              value={transferContent}
              onChange={(e) => setTransferContent(e.target.value)}
            />
            <input
              className="h-9 rounded-md border bg-background px-3 text-sm"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button size="sm" variant="secondary" onClick={() => void ordersQ.refetch()}>
              Lọc
            </Button>
          </div>

          {ordersQ.isLoading && <LoadingState />}
          {ordersQ.isError && <ErrorState onRetry={() => void ordersQ.refetch()} />}
          {ordersQ.data && !ordersQ.data.items.length && (
            <p className="text-sm text-muted-foreground">Không có đơn hàng.</p>
          )}
          {ordersQ.data && !!ordersQ.data.items.length && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left">Mã</th>
                    <th className="px-3 py-2 text-left">Org</th>
                    <th className="px-3 py-2 text-left">Gói</th>
                    <th className="px-3 py-2 text-right">Số tiền</th>
                    <th className="px-3 py-2 text-left">Trạng thái</th>
                    <th className="px-3 py-2 text-left">SePay txn</th>
                    <th className="px-3 py-2 text-left">Tạo lúc</th>
                    <th className="px-3 py-2 text-left">Tra soát</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersQ.data.items.map((o) => {
                    const txs = (o.transactions ?? []) as TxRow[];
                    return (
                      <tr key={o.id} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{o.code}</td>
                        <td className="px-3 py-2">
                          <div>{o.organization?.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {o.organization?.email}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {o.plan?.name ?? '—'}
                          {o.plan?.durationMonths ? ` (${o.plan.durationMonths}m)` : ''}
                        </td>
                        <td className="px-3 py-2 text-right">{formatCurrency(o.amountVnd)}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline">{o.statusLabel}</Badge>
                          {o.reviewNote && (
                            <div className="mt-1 max-w-[180px] truncate text-xs text-amber-300">
                              {o.reviewNote}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px]">
                          {txs[0]?.sepayTransactionId ?? '—'}
                          {txs[0] && (
                            <div className="text-muted-foreground">
                              id={txs[0].transactionId?.slice(0, 8)}…
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">{formatDateTime(o.createdAt)}</td>
                        <td className="px-3 py-2">
                          {o.status !== 'PAID' && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={reviewMut.isPending}
                              onClick={() => {
                                const note = window.prompt('Ghi chú tra soát thủ công');
                                if (!note || note.trim().length < 3) return;
                                reviewMut.mutate(
                                  { orderId: o.id, note: note.trim() },
                                  {
                                    onSuccess: () => window.alert('Đã đánh dấu cần kiểm tra'),
                                    onError: (e) =>
                                      window.alert(e instanceof Error ? e.message : 'Lỗi'),
                                  },
                                );
                              }}
                            >
                              Đánh dấu
                            </Button>
                          )}
                          {o.status === 'PAID' && (
                            <span className="text-xs text-muted-foreground">Đã PAID — khóa</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pager page={page} totalPages={ordersQ.data.totalPages} onPage={setPage} />
            </div>
          )}
        </div>
      )}

      {tab === 'transactions' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <input
              className="h-9 rounded-md border bg-background px-3 text-sm"
              placeholder="SePay ID / MKTA / lỗi"
              value={txQ}
              onChange={(e) => {
                setTxQ(e.target.value);
                setPage(1);
              }}
            />
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={txMatched}
              onChange={(e) => {
                setTxMatched(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả</option>
              <option value="true">Matched</option>
              <option value="false">Unmatched</option>
            </select>
          </div>
          {transactionsQ.isLoading && <LoadingState />}
          {transactionsQ.isError && (
            <ErrorState onRetry={() => void transactionsQ.refetch()} />
          )}
          {transactionsQ.data && !transactionsQ.data.items.length && (
            <p className="text-sm text-muted-foreground">Không có giao dịch.</p>
          )}
          {transactionsQ.data && !!transactionsQ.data.items.length && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left">SePay ID</th>
                    <th className="px-3 py-2 text-left">Txn UUID</th>
                    <th className="px-3 py-2 text-left">Đơn / Gói</th>
                    <th className="px-3 py-2 text-right">Số tiền</th>
                    <th className="px-3 py-2 text-left">HMAC/Auth</th>
                    <th className="px-3 py-2 text-left">Matched</th>
                    <th className="px-3 py-2 text-left">Lỗi xử lý</th>
                    <th className="px-3 py-2 text-left">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {(transactionsQ.data.items as TxRow[]).map((t) => (
                    <tr key={t.id} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{t.sepayTransactionId}</td>
                      <td className="px-3 py-2 font-mono text-[10px]">{t.transactionId}</td>
                      <td className="px-3 py-2">
                        <div className="font-mono text-xs">{t.paymentOrder?.code ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">
                          {t.paymentOrder?.plan?.name ?? '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrency(Number(t.amountVnd))}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {t.authMethod ?? '—'}
                        {t.authVerified ? ' ✓' : ' ✗'}
                        {t.hmacVerified ? ' · HMAC' : ''}
                      </td>
                      <td className="px-3 py-2">{t.matched ? '✓' : '✗'}</td>
                      <td className="px-3 py-2 max-w-[160px] truncate text-xs text-amber-200">
                        {t.processingError ?? t.matchedReason ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        {!t.matched && (
                          <div className="flex flex-col gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={reprocessMut.isPending}
                              onClick={() => reprocess(t, false)}
                            >
                              Xử lý lại
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={reprocessMut.isPending}
                              onClick={() => reprocess(t, true)}
                            >
                              Force
                            </Button>
                          </div>
                        )}
                        {t.matched && (
                          <span className="text-xs text-muted-foreground">Đã kích hoạt</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager
                page={page}
                totalPages={transactionsQ.data.totalPages}
                onPage={setPage}
              />
            </div>
          )}
        </div>
      )}

      {tab === 'subscriptions' && (
        <div>
          {subQ.isLoading && <LoadingState />}
          {subQ.isError && <ErrorState onRetry={() => void subQ.refetch()} />}
          {subQ.data && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left">Organization</th>
                    <th className="px-3 py-2 text-left">Gói</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Hết hạn</th>
                  </tr>
                </thead>
                <tbody>
                  {subQ.data.items.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-3 py-2">
                        <div>{s.organization?.name}</div>
                        <div className="text-xs text-muted-foreground">{s.organization?.email}</div>
                      </td>
                      <td className="px-3 py-2">{s.plan?.name}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">{s.isExpired ? 'EXPIRED' : s.status}</Badge>
                      </td>
                      <td className="px-3 py-2 text-xs">{formatDateTime(s.currentPeriodEnd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager page={page} totalPages={subQ.data.totalPages} onPage={setPage} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Trước
      </Button>
      <span className="text-xs text-muted-foreground">
        {page}/{totalPages}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Sau
      </Button>
    </div>
  );
}
