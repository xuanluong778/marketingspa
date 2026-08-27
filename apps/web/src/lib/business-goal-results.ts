/**
 * Bảng kết quả A–M + KPI bổ sung, 100% map từ calculateBusinessGoalMetrics / calculateBusinessGoals.
 * Không nhân đôi công thức tiền/lãi — chỉ format + hàng diễn giải.
 */
import type { BusinessGoalMetrics } from './business-goal-metrics';
import { formatVnd } from './format';

export type ResultTone = 'safe' | 'watch' | 'risk' | 'neutral';

export type BusinessGoalResultRow = {
  id: string;
  /** A…M hoặc N1… */
  code: string;
  label: string;
  formula: string;
  resultText: string;
  explanation: string;
};

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return formatVnd(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
}

function fmtCount(n: number | null | undefined, unit: string): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('vi-VN')} ${unit}`;
}

/**
 * A–M theo mẫu bảng. Ưu tiên số liệu đã có trên metrics (không tính tiền lại).
 * F (doanh thu hòa vốn) = E / (D/100) khi có biên lãi gộp — cùng logic kinh tế với break-even đơn.
 * K = ceil(A / G) theo mẫu (số đơn cho doanh thu kế hoạch A).
 * L = ceil(K / I) khi có tỷ lệ chuyển đổi.
 */
export function buildBusinessGoalResultTable(metrics: BusinessGoalMetrics): BusinessGoalResultRow[] {
  const A = metrics.totalRevenue;
  const B = metrics.variableCost;
  const C = metrics.grossProfit;
  const D = metrics.grossProfitMargin; // %
  const E = metrics.apiInput.fixedCost;
  const G = metrics.apiInput.averageRevenuePerTransaction;
  const I = metrics.apiInput.leadConversionRate;
  const H = metrics.breakEvenTransactions;
  const J = metrics.breakEvenLeadsInsufficientData ? null : metrics.breakEvenLeads;
  const M = metrics.netProfit;

  // Prefer metrics.values already extended
  const beRev = metrics.breakEvenRevenue;
  const K = metrics.ordersForRevenueTarget;
  const L = metrics.leadsForRevenueTarget;

  return [
    {
      id: 'A',
      code: 'A',
      label: 'Doanh thu mục tiêu',
      formula: '',
      resultText: fmtMoney(A),
      explanation:
        'Tổng tiền bán hàng cần đạt trong tháng (trước khi trừ chi phí). Đây là “đích doanh thu” bạn đang nhắm.',
    },
    {
      id: 'B',
      code: 'B',
      label: 'Chi phí biến đổi',
      formula: '',
      resultText: fmtMoney(B),
      explanation:
        'Chi phí tăng khi bán nhiều hơn — ví dụ nguyên liệu, hàng hóa, hoa hồng theo từng đơn.',
    },
    {
      id: 'C',
      code: 'C',
      label: 'Lãi gộp',
      formula: 'A − B',
      resultText: fmtMoney(C),
      explanation:
        'Tiền còn lại sau khi trừ chi phí biến đổi. Phần này dùng để trả chi phí cố định và tạo lợi nhuận.',
    },
    {
      id: 'D',
      code: 'D',
      label: 'Tỷ lệ lãi gộp',
      formula: 'C ÷ A',
      resultText: fmtPct(D),
      explanation:
        'Cứ 100 đồng doanh thu thì giữ lại bao nhiêu đồng lãi gộp sau chi phí biến đổi.',
    },
    {
      id: 'E',
      code: 'E',
      label: 'Chi phí cố định',
      formula: '',
      resultText: fmtMoney(E),
      explanation:
        'Chi phí mỗi tháng gần như cố định (lương, thuê mặt bằng, marketing cố định…) dù bán nhiều hay ít.',
    },
    {
      id: 'F',
      code: 'F',
      label: 'Doanh thu hòa vốn',
      formula: 'E ÷ D',
      resultText: beRev != null ? `≈ ${fmtMoney(beRev)}` : '—',
      explanation:
        'Số tiền tối thiểu cần bán trong tháng để đủ trả chi phí, chưa lời cũng chưa lỗ.',
    },
    {
      id: 'G',
      code: 'G',
      label: 'Giá trị trung bình / đơn',
      formula: '',
      resultText: fmtMoney(G),
      explanation: 'Trung bình một khách mua bao nhiêu tiền trong một giao dịch.',
    },
    {
      id: 'H',
      code: 'H',
      label: 'Số đơn hòa vốn',
      formula: 'F ÷ G',
      resultText: fmtCount(H, 'đơn'),
      explanation: 'Số đơn hàng tối thiểu cần bán để đủ bù chi phí (hòa vốn).',
    },
    {
      id: 'I',
      code: 'I',
      label: 'Tỷ lệ chuyển đổi',
      formula: '',
      resultText: fmtPct(I),
      explanation:
        'Trong 100 khách tiềm năng, khoảng bao nhiêu người mua hàng (ví dụ 15% = 15 người mua).',
    },
    {
      id: 'J',
      code: 'J',
      label: 'Khách tiềm năng hòa vốn',
      formula: 'H ÷ I',
      resultText: metrics.breakEvenLeadsInsufficientData
        ? 'Chưa đủ dữ liệu'
        : fmtCount(J, 'người'),
      explanation:
        'Cần bao nhiêu khách tiềm năng (lead) để có đủ đơn hòa vốn, dựa trên tỷ lệ chuyển đổi hiện tại.',
    },
    {
      id: 'K',
      code: 'K',
      label: 'Số đơn cần để đạt doanh thu mục tiêu',
      formula: 'A ÷ G',
      resultText: fmtCount(K, 'đơn'),
      explanation: 'Số đơn phải bán trong tháng để chạm mục tiêu doanh thu (dòng A).',
    },
    {
      id: 'L',
      code: 'L',
      label: 'Khách tiềm năng cần có',
      formula: 'K ÷ I',
      resultText: fmtCount(L, 'người'),
      explanation:
        'Số khách tiềm năng cần tiếp cận để ra đủ số đơn mục tiêu, nếu tỷ lệ chốt giữ như hiện tại.',
    },
    {
      id: 'M',
      code: 'M',
      label: 'Lợi nhuận trước thuế',
      formula: 'A − B − E',
      resultText: fmtMoney(M),
      explanation:
        'Tiền còn lại sau chi phí biến đổi và chi phí cố định — chưa trừ thuế hay các khoản phát sinh khác.',
    },
  ];
}

/** KPI phụ: chỉ khi có đủ dữ liệu nguồn. */
export function buildBusinessGoalExtraRows(metrics: BusinessGoalMetrics): BusinessGoalResultRow[] {
  const rows: BusinessGoalResultRow[] = [];

  if (metrics.profitMargin != null) {
    rows.push({
      id: 'N1',
      code: '+',
      label: 'Biên lợi nhuận ròng',
      formula: 'M ÷ A',
      resultText: fmtPct(metrics.profitMargin),
      explanation: 'Tỷ lệ lợi nhuận trên doanh thu sau khi trừ hết chi phí cố định và biến đổi.',
    });
  }

  if (metrics.costPerOrder != null) {
    rows.push({
      id: 'N2',
      code: '+',
      label: 'Chi phí bình quân / đơn',
      formula: '(B + E) ÷ số đơn',
      resultText: fmtMoney(metrics.costPerOrder),
      explanation: 'Trung bình mỗi đơn “ăn” bao nhiêu chi phí (biến đổi + cố định chia cho số đơn).',
    });
  }

  if (metrics.ordersShortToBreakEven != null && metrics.breakEvenTransactions != null) {
    const gap = metrics.ordersShortToBreakEven;
    rows.push({
      id: 'N3',
      code: '+',
      label: 'Khoảng cách tới điểm hòa vốn',
      formula: 'H − số đơn hiện tại',
      resultText: gap === 0 ? 'Đã đạt / vượt hòa vốn' : fmtCount(gap, 'đơn còn thiếu'),
      explanation:
        gap === 0
          ? 'Số đơn hiện tại đã đủ hoặc vượt mức hòa vốn.'
          : 'Còn thiếu bao nhiêu đơn nữa mới đủ bù chi phí.',
    });
  }

  if (metrics.ordersShortToProfitTarget != null && metrics.targetTransactions != null) {
    const gap = metrics.ordersShortToProfitTarget;
    rows.push({
      id: 'N4',
      code: '+',
      label: 'Số đơn còn thiếu (theo lợi nhuận mục tiêu)',
      formula: 'đơn mục tiêu − số đơn hiện tại',
      resultText: gap === 0 ? 'Đã đủ mục tiêu lợi nhuận' : fmtCount(gap, 'đơn'),
      explanation:
        'Số đơn còn cần để vừa trả chi phí cố định vừa đạt lợi nhuận mục tiêu bạn đã nhập.',
    });
  }

  if (metrics.leadsShortToProfitTarget != null && metrics.targetLeads != null) {
    const gap = metrics.leadsShortToProfitTarget;
    rows.push({
      id: 'N5',
      code: '+',
      label: 'Số lead còn thiếu (theo lợi nhuận mục tiêu)',
      formula: 'lead mục tiêu − lead hiện có',
      resultText: gap === 0 ? 'Đã đủ lead mục tiêu' : fmtCount(gap, 'lead'),
      explanation: 'Còn thiếu bao nhiêu khách tiềm năng để chốt đủ đơn đạt lợi nhuận mong muốn.',
    });
  }

  return rows;
}

export function buildBusinessGoalPlainSummary(metrics: BusinessGoalMetrics): string {
  const rev = formatVnd(metrics.totalRevenue);
  const beTx =
    metrics.breakEvenTransactions != null
      ? metrics.breakEvenTransactions.toLocaleString('vi-VN')
      : null;
  const targetTx =
    metrics.apiInput.averageRevenuePerTransaction > 0
      ? Math.ceil(metrics.totalRevenue / metrics.apiInput.averageRevenuePerTransaction).toLocaleString(
          'vi-VN',
        )
      : null;
  const conv = metrics.apiInput.leadConversionRate;
  const needLeads =
    targetTx && conv > 0
      ? Math.ceil(
          Math.ceil(metrics.totalRevenue / metrics.apiInput.averageRevenuePerTransaction) /
            (conv / 100),
        ).toLocaleString('vi-VN')
      : null;
  const profit = formatVnd(metrics.netProfit);
  const statusWord =
    metrics.status === 'profit'
      ? 'đang có lãi'
      : metrics.status === 'loss'
        ? 'đang lỗ'
        : 'đang quanh điểm hòa vốn';

  const parts: string[] = [];
  parts.push(`Với số liệu hiện tại, mô hình của bạn ${statusWord} (lợi nhuận trước thuế khoảng ${profit}).`);
  if (beTx) {
    parts.push(`Bạn cần khoảng ${beTx} đơn để hòa vốn`);
  }
  if (targetTx) {
    parts.push(`và khoảng ${targetTx} đơn để đạt doanh thu ${rev}`);
  }
  if (needLeads && conv > 0) {
    parts.push(
      `Với tỷ lệ chuyển đổi ${conv.toLocaleString('vi-VN')}%, bạn cần khoảng ${needLeads} khách tiềm năng.`,
    );
  }
  return parts.join(parts.length > 2 ? '. ' : ' ').replace(/\.\./g, '.');
}

export type HighlightCard = {
  id: string;
  label: string;
  value: string;
  tone: ResultTone;
  toneLabel: string;
  hint: string;
};

function toneLabel(t: ResultTone): string {
  if (t === 'safe') return 'An toàn';
  if (t === 'watch') return 'Cần chú ý';
  if (t === 'risk') return 'Chưa đạt';
  return 'Tham khảo';
}

export function buildBusinessGoalHighlights(metrics: BusinessGoalMetrics): HighlightCard[] {
  const be = metrics.breakEvenTransactions;
  const targetOrders = metrics.ordersForRevenueTarget;
  const targetLeads = metrics.leadsForRevenueTarget;
  const beRev = metrics.breakEvenRevenue;

  let beTone: ResultTone = 'neutral';
  if (metrics.status === 'profit') beTone = 'safe';
  else if (metrics.status === 'break_even') beTone = 'watch';
  else beTone = 'risk';

  let ordersTone: ResultTone = beTone;
  if (be != null && targetOrders != null && be > 0) {
    if (targetOrders >= be * 1.2) ordersTone = 'safe';
    else if (targetOrders >= be) ordersTone = 'watch';
    else ordersTone = 'risk';
  }

  let profitTone: ResultTone = 'neutral';
  if (metrics.status === 'profit') profitTone = 'safe';
  else if (metrics.status === 'break_even') profitTone = 'watch';
  else profitTone = 'risk';

  return [
    {
      id: 'be-rev',
      label: 'Doanh thu hòa vốn',
      value: beRev != null ? fmtMoney(beRev) : '—',
      tone: beTone,
      toneLabel: toneLabel(beTone),
      hint: 'Bán ít hơn mức này là dễ lỗ',
    },
    {
      id: 'orders',
      label: 'Số đơn cần bán',
      value: targetOrders != null ? fmtCount(targetOrders, 'đơn') : '—',
      tone: ordersTone,
      toneLabel: toneLabel(ordersTone),
      hint: 'Để đạt doanh thu mục tiêu',
    },
    {
      id: 'leads',
      label: 'Khách tiềm năng cần có',
      value: targetLeads != null ? fmtCount(targetLeads, 'người') : '—',
      tone: ordersTone,
      toneLabel: toneLabel(ordersTone),
      hint: 'Theo tỷ lệ chuyển đổi hiện tại',
    },
    {
      id: 'profit',
      label: 'Lợi nhuận dự kiến',
      value: fmtMoney(metrics.netProfit),
      tone: profitTone,
      toneLabel: toneLabel(profitTone),
      hint: 'Sau chi phí biến đổi + cố định (trước thuế)',
    },
  ];
}
