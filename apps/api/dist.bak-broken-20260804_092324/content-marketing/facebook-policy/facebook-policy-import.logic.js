"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeLandingSignals = analyzeLandingSignals;
exports.importPolicyUrl = importPolicyUrl;
const website_crawl_util_1 = require("../../chatbot-cskh/utils/website-crawl.util");
const encryption_util_1 = require("../../common/utils/encryption.util");
const facebook_policy_ssrf_fetch_1 = require("./facebook-policy-ssrf-fetch");
const facebook_policy_url_parse_1 = require("./facebook-policy-url-parse");
function analyzeLandingSignals(html, text) {
    const blob = `${html}\n${text}`;
    const lower = blob.toLowerCase();
    const productHints = [];
    const productMatch = blob.match(/sản phẩm\s*[:：]?\s*([^\n<.!]{3,80})/i);
    if (productMatch?.[1])
        productHints.push(productMatch[1].trim());
    const nameHints = blob.match(/\b([A-ZÀ-Ỹ][\wÀ-ỹ]+(?:\s+[A-ZÀ-Ỹ\wÀ-ỹ]+){0,4})\s+(Pro|Plus|Max)\b/);
    if (nameHints?.[0])
        productHints.push(nameHints[0].trim());
    const priceHints = [];
    const priceRe = /(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*(?:đ|vnd|vnđ|₫)/gi;
    let m;
    while ((m = priceRe.exec(blob)) && priceHints.length < 5) {
        priceHints.push(m[0]);
    }
    const ctaHints = [];
    for (const c of ['mua ngay', 'đặt hàng', 'inbox', 'liên hệ', 'đăng ký']) {
        if (lower.includes(c))
            ctaHints.push(c);
    }
    const hasSensitiveForm = /type\s*=\s*["']password["']/i.test(html) ||
        /\bcvv\b/i.test(blob) ||
        /số\s*thẻ|so the|otp ngân hàng|otp ngan hang/i.test(blob);
    const phishingSignals = [];
    if (/otp\s*ngân\s*hàng|otp ngan hang/i.test(blob))
        phishingSignals.push('otp_bank');
    if (/paypal/i.test(blob) && /xác minh|xac minh|otp/i.test(blob)) {
        phishingSignals.push('paypal_verify');
    }
    if (/nhập\s*mật\s*khẩu\s*ngân\s*hàng/i.test(blob))
        phishingSignals.push('bank_password');
    return {
        productHints,
        priceHints,
        ctaHints,
        hasSensitiveForm,
        phishingSignals,
    };
}
async function importFacebookViaGraph(ctx, kind) {
    const warnings = [];
    const encryptionKey = ctx.config.get('ENCRYPTION_KEY') || '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (await ctx.prisma.autoPostFacebookPage.findMany({
        where: {
            connection: { organizationId: ctx.organizationId },
            ...(ctx.fanpageId ? { pageId: ctx.fanpageId } : {}),
        },
        include: { connection: true },
        take: 20,
    }));
    if (!rows.length) {
        return {
            sourceType: kind,
            url: ctx.url,
            editable: true,
            warnings: [
                'Chưa kết nối Fanpage OAuth — không đọc được caption Facebook. Dán caption/transcript thủ công.',
            ],
            insufficientData: true,
            statusHint: 'PERMISSION_REQUIRED',
            message: 'PERMISSION_REQUIRED: thiếu Fanpage OAuth / token',
        };
    }
    const pages = [];
    for (const row of rows) {
        const scopes = Array.isArray(row.connection?.scopes) ? row.connection.scopes : [];
        try {
            if (!encryptionKey || encryptionKey.length < 16) {
                warnings.push('ENCRYPTION_KEY chưa cấu hình — không giải mã token.');
                continue;
            }
            const token = (0, encryption_util_1.decryptSecret)(row.encryptedPageAccessToken, encryptionKey).trim();
            if (!token)
                continue;
            pages.push({
                pageId: row.pageId,
                pageName: row.pageName || row.pageId,
                token,
                scopes,
            });
        }
        catch {
            warnings.push('Không giải mã được page token (bỏ qua page).');
        }
    }
    if (!pages.length) {
        return {
            sourceType: kind,
            url: ctx.url,
            editable: true,
            warnings: [
                ...warnings,
                'Fanpage có bản ghi nhưng thiếu token hợp lệ / scope — dán caption thủ công.',
            ],
            insufficientData: true,
            statusHint: 'PERMISSION_REQUIRED',
            message: 'PERMISSION_REQUIRED: token Fanpage không dùng được',
        };
    }
    const usable = pages.filter((p) => p.scopes.length === 0 ||
        p.scopes.some((s) => /pages_read|pages_manage|page/i.test(String(s))));
    if (!usable.length) {
        return {
            sourceType: kind,
            url: ctx.url,
            editable: true,
            warnings: ['Fanpage thiếu quyền đọc nội dung (scopes).'],
            insufficientData: true,
            statusHint: 'PERMISSION_REQUIRED',
            message: 'PERMISSION_REQUIRED: thiếu scopes Fanpage',
        };
    }
    // Attempt Graph fetch without logging tokens
    const parsed = (0, facebook_policy_url_parse_1.parseFacebookContentUrl)(ctx.url);
    const page = usable.find((p) => p.pageId === parsed?.pageHint) || usable[0];
    if (!page) {
        return {
            sourceType: kind,
            url: ctx.url,
            editable: true,
            warnings: [...warnings, 'Không chọn được Fanpage phù hợp.'],
            insufficientData: true,
            statusHint: 'PERMISSION_REQUIRED',
            message: 'PERMISSION_REQUIRED: thiếu Fanpage',
        };
    }
    try {
        const objectId = parsed?.contentId;
        if (!objectId) {
            return {
                sourceType: kind,
                url: ctx.url,
                editable: true,
                pageId: page.pageId,
                pageName: page.pageName,
                warnings: [...warnings, 'Không parse được post id — dán caption thủ công.'],
                insufficientData: true,
                statusHint: 'INSUFFICIENT_DATA',
                message: 'INSUFFICIENT_DATA: không xác định được object Facebook',
            };
        }
        const graphUrl = `https://graph.facebook.com/v19.0/${encodeURIComponent(objectId)}?fields=message,story,permalink_url,full_picture&access_token=${encodeURIComponent(page.token)}`;
        const res = await fetch(graphUrl, { signal: AbortSignal.timeout(12_000) });
        if (!res.ok) {
            return {
                sourceType: kind,
                url: ctx.url,
                editable: true,
                pageId: page.pageId,
                pageName: page.pageName,
                warnings: [...warnings, `Graph API HTTP ${res.status}`],
                insufficientData: true,
                statusHint: 'PERMISSION_REQUIRED',
                message: 'PERMISSION_REQUIRED: Graph không trả nội dung (token/scope/id)',
            };
        }
        const data = (await res.json());
        const primaryText = (data.message || data.story || '').trim();
        if (!primaryText) {
            return {
                sourceType: kind,
                url: ctx.url,
                editable: true,
                pageId: page.pageId,
                pageName: page.pageName,
                permalink: data.permalink_url,
                thumbnailUrl: data.full_picture,
                warnings: [...warnings, 'Bài không có caption công khai.'],
                insufficientData: true,
                statusHint: 'INSUFFICIENT_DATA',
                message: 'INSUFFICIENT_DATA: thiếu caption',
            };
        }
        return {
            sourceType: kind,
            url: ctx.url,
            finalUrl: data.permalink_url || ctx.url,
            editable: true,
            primaryText,
            permalink: data.permalink_url,
            thumbnailUrl: data.full_picture,
            pageId: page.pageId,
            pageName: page.pageName,
            warnings,
            insufficientData: false,
            statusHint: 'OK',
        };
    }
    catch {
        return {
            sourceType: kind,
            url: ctx.url,
            editable: true,
            pageId: page.pageId,
            pageName: page.pageName,
            warnings: [...warnings, 'Lỗi gọi Graph API.'],
            insufficientData: true,
            statusHint: 'INSUFFICIENT_DATA',
            message: 'INSUFFICIENT_DATA: không tải được nội dung Facebook',
        };
    }
}
async function importPolicyUrl(ctx) {
    const kind = (0, facebook_policy_url_parse_1.detectPolicyUrlKind)(ctx.url, ctx.urlKind);
    if (kind.startsWith('facebook_')) {
        return importFacebookViaGraph(ctx, kind);
    }
    try {
        await (0, facebook_policy_ssrf_fetch_1.assertPublicHttpUrl)(ctx.url);
        const fetched = await (0, facebook_policy_ssrf_fetch_1.fetchPublicHtmlSafe)(ctx.url);
        const landing = analyzeLandingSignals(fetched.html, fetched.text);
        const primaryText = fetched.text.slice(0, 6000);
        return {
            sourceType: kind === 'landing_page' ? 'landing_page' : 'website',
            url: ctx.url,
            finalUrl: fetched.finalUrl,
            editable: true,
            headline: fetched.title.slice(0, 200),
            primaryText,
            warnings: primaryText.length < 40 ? ['Nội dung trang khá ngắn.'] : [],
            insufficientData: primaryText.length < 40,
            statusHint: primaryText.length < 40 ? 'INSUFFICIENT_DATA' : 'OK',
            message: primaryText.length < 40
                ? 'INSUFFICIENT_DATA: trang không đủ nội dung công khai'
                : undefined,
            landing,
        };
    }
    catch (e) {
        if (e instanceof website_crawl_util_1.CrawlValidationError)
            throw e;
        return {
            sourceType: kind,
            url: ctx.url,
            editable: true,
            warnings: [e instanceof Error ? e.message : 'Import thất bại'],
            insufficientData: true,
            statusHint: 'INSUFFICIENT_DATA',
            message: 'INSUFFICIENT_DATA: không import được URL',
        };
    }
}
//# sourceMappingURL=facebook-policy-import.logic.js.map