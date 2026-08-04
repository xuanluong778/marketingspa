"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkFacebookAdPolicyMerged = checkFacebookAdPolicyMerged;
const facebook_policy_config_1 = require("./facebook-policy.config");
const facebook_policy_logic_1 = require("./facebook-policy.logic");
const facebook_policy_engine_1 = require("./facebook-policy.engine");
const LANDING_CODE = facebook_policy_config_1.FACEBOOK_ADS_POLICY_CATALOG.LANDING.policyCode;
function landingFindings(input, landingImport) {
    if (!landingImport?.landing)
        return [];
    const L = landingImport.landing;
    const out = [];
    const product = (input.productService || input.headline || '').toLowerCase();
    const landingProducts = L.productHints.join(' ').toLowerCase();
    if (product &&
        landingProducts &&
        !landingProducts.includes(product.slice(0, Math.min(12, product.length))) &&
        !product.split(/\s+/).some((w) => w.length > 3 && landingProducts.includes(w))) {
        const excerpt = L.productHints[0] || landingImport.primaryText?.slice(0, 80) || '';
        const reason = 'Sản phẩm trên landing có vẻ khác copy quảng cáo — dễ bị Meta đánh giá lệch destination.';
        out.push({
            id: 'landing-product-mismatch',
            field: 'landingPageText',
            excerpt,
            evidence: excerpt,
            policyGroup: 'LANDING',
            policyCode: LANDING_CODE,
            severity: 'HIGH',
            reason,
            explanation: reason,
            remediation: 'Đồng bộ tên sản phẩm/giá giữa ads và landing.',
            suggestion: 'Đồng bộ tên sản phẩm/giá giữa ads và landing.',
            signalCount: 2,
            signals: ['product_ad', 'product_landing'],
            source: 'rule',
        });
    }
    if (L.phishingSignals.length || L.hasSensitiveForm) {
        const excerpt = L.phishingSignals.join(', ') || 'sensitive_form';
        const reason = 'Landing có tín hiệu form nhạy cảm / phishing (OTP, PayPal verify, CVV…).';
        out.push({
            id: 'landing-phishing',
            field: 'landingPageText',
            excerpt,
            evidence: excerpt,
            policyGroup: 'LANDING',
            policyCode: LANDING_CODE,
            severity: 'CRITICAL',
            reason,
            explanation: reason,
            remediation: 'Gỡ form nhạy cảm khỏi landing quảng cáo.',
            suggestion: 'Gỡ form nhạy cảm khỏi landing quảng cáo.',
            signalCount: 2,
            signals: L.phishingSignals.length ? L.phishingSignals : ['sensitive_form', 'password'],
            source: 'rule',
        });
    }
    if (L.priceHints.length >= 1 && /giá|₫|đ|vnd/i.test(input.primaryText || input.headline || '')) {
        const adHasPrice = /\d/.test(input.primaryText || '') || /\d/.test(input.headline || '');
        if (adHasPrice) {
            const excerpt = L.priceHints[0] || '';
            const reason = 'Landing và ads đều nhắc giá — kiểm tra khớp số liệu để tránh gây hiểu nhầm.';
            out.push({
                id: 'landing-price',
                field: 'landingPageText',
                excerpt,
                evidence: excerpt,
                policyGroup: 'LANDING',
                policyCode: LANDING_CODE,
                severity: 'MEDIUM',
                reason,
                explanation: reason,
                remediation: 'Đảm bảo giá trên ads khớp landing.',
                suggestion: 'Đảm bảo giá trên ads khớp landing.',
                signalCount: 2,
                signals: ['price_ad', 'price_landing'],
                source: 'rule',
            });
        }
    }
    return out;
}
async function checkFacebookAdPolicyMerged(params) {
    const media = params.media || [];
    const mediaInsufficient = media.some((m) => m.insufficientData);
    const baseInsufficient = (0, facebook_policy_engine_1.hasInsufficientAdCopy)(params.input);
    // Video/media without transcript must force INSUFFICIENT_DATA (never treat as safe)
    if (mediaInsufficient && media.every((m) => m.mediaType === 'video' || !m.ocrText)) {
        const base = await (0, facebook_policy_logic_1.checkFacebookAdPolicy)(params.input, params.openai);
        return {
            ...base,
            overallStatus: 'INSUFFICIENT_DATA',
            riskScore: Math.max(base.riskScore, 15),
            summary: 'INSUFFICIENT_DATA: media thiếu transcript/OCR — không thể kết luận an toàn.',
            findings: [...base.findings, ...media.flatMap((m) => m.findings)],
        };
    }
    const base = await (0, facebook_policy_logic_1.checkFacebookAdPolicy)(params.input, params.openai);
    const extra = [
        ...media.flatMap((m) => m.findings),
        ...landingFindings(params.input, params.landingImport),
    ];
    // Dedupe by id
    const map = new Map();
    for (const f of [...base.findings, ...extra]) {
        if (!map.has(f.id))
            map.set(f.id, f);
    }
    const findings = [...map.values()];
    const insufficient = baseInsufficient && findings.length === 0 && mediaInsufficient;
    const riskScore = insufficient ? 0 : (0, facebook_policy_engine_1.computeRiskScore)(findings);
    const overallStatus = (0, facebook_policy_engine_1.statusFromScore)(riskScore, findings, insufficient || mediaInsufficient);
    return {
        ...base,
        findings,
        riskScore,
        overallStatus: mediaInsufficient && overallStatus === 'PASS_CANDIDATE' ? 'INSUFFICIENT_DATA' : overallStatus,
        layers: {
            ...base.layers,
            ruleFindingCount: findings.length,
        },
        summary: overallStatus === 'INSUFFICIENT_DATA' || mediaInsufficient
            ? 'INSUFFICIENT_DATA từ media/landing — bổ sung transcript/OCR rồi check lại.'
            : base.summary,
    };
}
//# sourceMappingURL=facebook-policy-merge.logic.js.map