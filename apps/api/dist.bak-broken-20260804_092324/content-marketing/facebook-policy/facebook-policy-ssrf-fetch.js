"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertPublicHttpUrl = assertPublicHttpUrl;
exports.fetchPublicHtmlSafe = fetchPublicHtmlSafe;
/**
 * SSRF-safe URL validation for policy import (throws CrawlValidationError).
 */
const promises_1 = require("dns/promises");
const net_1 = require("net");
const website_crawl_util_1 = require("../../chatbot-cskh/utils/website-crawl.util");
function ipv4ToInt(ip) {
    return ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}
function isPrivateOrReservedIp(ip) {
    const v = (0, net_1.isIP)(ip);
    if (v === 4) {
        const n = ipv4ToInt(ip);
        const ranges = [
            [ipv4ToInt('0.0.0.0'), ipv4ToInt('0.255.255.255')],
            [ipv4ToInt('10.0.0.0'), ipv4ToInt('10.255.255.255')],
            [ipv4ToInt('127.0.0.0'), ipv4ToInt('127.255.255.255')],
            [ipv4ToInt('169.254.0.0'), ipv4ToInt('169.254.255.255')],
            [ipv4ToInt('172.16.0.0'), ipv4ToInt('172.31.255.255')],
            [ipv4ToInt('192.168.0.0'), ipv4ToInt('192.168.255.255')],
            [ipv4ToInt('100.64.0.0'), ipv4ToInt('100.127.255.255')],
            [ipv4ToInt('224.0.0.0'), ipv4ToInt('255.255.255.255')],
        ];
        return ranges.some(([a, b]) => n >= a && n <= b);
    }
    if (v === 6) {
        const lower = ip.toLowerCase();
        if (lower === '::1' || lower === '::')
            return true;
        if (lower.startsWith('fc') || lower.startsWith('fd'))
            return true;
        if (lower.startsWith('fe80'))
            return true;
        if (lower.startsWith('ff'))
            return true;
        const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (mapped?.[1])
            return isPrivateOrReservedIp(mapped[1]);
    }
    return true;
}
async function assertPublicHttpUrl(raw) {
    const trimmed = (raw || '').trim();
    if (!trimmed)
        throw new website_crawl_util_1.CrawlValidationError('URL không được để trống.');
    let parsed;
    try {
        parsed = new URL(trimmed);
    }
    catch {
        throw new website_crawl_util_1.CrawlValidationError('URL không hợp lệ.');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new website_crawl_util_1.CrawlValidationError('URL phải bắt đầu bằng http:// hoặc https://');
    }
    if (parsed.username || parsed.password) {
        throw new website_crawl_util_1.CrawlValidationError('URL không được chứa thông tin đăng nhập.');
    }
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
        throw new website_crawl_util_1.CrawlValidationError('Không quét URL nội bộ.');
    }
    if (host === 'metadata.google.internal' || host.endsWith('.internal')) {
        throw new website_crawl_util_1.CrawlValidationError('Không quét URL nội bộ.');
    }
    if ((0, net_1.isIP)(host)) {
        if (isPrivateOrReservedIp(host)) {
            throw new website_crawl_util_1.CrawlValidationError('Không quét URL nội bộ.');
        }
    }
    else {
        let records;
        try {
            records = await (0, promises_1.lookup)(host, { all: true, verbatim: true });
        }
        catch {
            throw new website_crawl_util_1.CrawlValidationError('Không phân giải được tên miền.');
        }
        for (const rec of records) {
            if (isPrivateOrReservedIp(rec.address)) {
                throw new website_crawl_util_1.CrawlValidationError('Không quét URL nội bộ.');
            }
        }
    }
    return parsed;
}
async function fetchPublicHtmlSafe(rawUrl, opts) {
    const timeoutMs = opts?.timeoutMs ?? 12_000;
    const maxBytes = opts?.maxBytes ?? 1_500_000;
    const maxRedirects = opts?.maxRedirects ?? 3;
    let current = await assertPublicHttpUrl(rawUrl);
    let redirects = 0;
    for (let hop = 0; hop <= maxRedirects; hop++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
            response = await fetch(current.toString(), {
                method: 'GET',
                redirect: 'manual',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; MarketingAutoAZ-PolicyImporter/1.0)',
                    Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
                },
                signal: controller.signal,
            });
        }
        catch (e) {
            clearTimeout(timer);
            throw new website_crawl_util_1.CrawlValidationError(e instanceof Error && e.name === 'AbortError'
                ? 'Hết thời gian chờ khi tải trang.'
                : e instanceof Error
                    ? e.message
                    : 'Không tải được trang.');
        }
        finally {
            clearTimeout(timer);
        }
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const loc = response.headers.get('location');
            if (!loc)
                throw new website_crawl_util_1.CrawlValidationError('Redirect thiếu Location.');
            redirects += 1;
            if (redirects > maxRedirects) {
                throw new website_crawl_util_1.CrawlValidationError('Quá nhiều lần redirect.');
            }
            current = await assertPublicHttpUrl(new URL(loc, current).toString());
            continue;
        }
        if (!response.ok) {
            throw new website_crawl_util_1.CrawlValidationError(`Máy chủ trả HTTP ${response.status}.`);
        }
        const reader = response.body?.getReader();
        if (!reader)
            throw new website_crawl_util_1.CrawlValidationError('Không đọc được nội dung trang.');
        const chunks = [];
        let total = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            if (value) {
                total += value.byteLength;
                if (total > maxBytes) {
                    try {
                        await reader.cancel();
                    }
                    catch {
                        /* ignore */
                    }
                    throw new website_crawl_util_1.CrawlValidationError('Trang quá lớn để phân tích.');
                }
                chunks.push(value);
            }
        }
        const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = (titleMatch?.[1] || current.hostname).replace(/\s+/g, ' ').trim();
        const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 20_000);
        return { finalUrl: current.toString(), title, text, html };
    }
    throw new website_crawl_util_1.CrawlValidationError('Quá nhiều lần redirect.');
}
//# sourceMappingURL=facebook-policy-ssrf-fetch.js.map