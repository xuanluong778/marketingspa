'use client';

import { CheckContentAdsPanel } from '@/components/content-marketing/facebook-policy/check-content-ads-panel';

/**
 * Section `/content?tab=create&section=facebook-check` (alias `ads-check`).
 * Reuses CheckContentAdsPanel — no duplicated policy UI.
 */
export function AdsPolicyCheckStudio() {
  return (
    <div className="space-y-4 text-slate-900">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Kết quả mang tính hỗ trợ rà soát rủi ro chính sách —{' '}
        <strong>không khẳng định chắc chắn Facebook / Meta sẽ duyệt</strong>. Luôn review thủ công
        trước khi chạy ads hoặc đăng bài.
      </p>
      <CheckContentAdsPanel />
    </div>
  );
}

export default AdsPolicyCheckStudio;
