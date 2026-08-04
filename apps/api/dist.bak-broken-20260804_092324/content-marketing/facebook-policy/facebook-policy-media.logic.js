"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanStrongMediaClaims = scanStrongMediaClaims;
exports.findingsFromMediaText = findingsFromMediaText;
exports.analyzePolicyTranscriptOnly = analyzePolicyTranscriptOnly;
exports.analyzePolicyImage = analyzePolicyImage;
exports.analyzePolicyVideo = analyzePolicyVideo;
const facebook_policy_config_1 = require("./facebook-policy.config");
const MEDIA_CODE = facebook_policy_config_1.FACEBOOK_ADS_POLICY_CATALOG.MEDIA.policyCode;
function norm(s) {
    return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
}
/** Strong OCR/transcript claims (VN). */
function scanStrongMediaClaims(text, prefix) {
    const n = norm(text);
    const findings = [];
    const hasWeight = /(giam|giảm)\s*\d+\s*(kg|ký|kilo)/i.test(text) || /giam\s*\d+\s*kg/.test(n);
    const hasTime = /(trong|sau)\s*\d+\s*(ngay|ngày|tuan|tuần)/i.test(text) ||
        /trong\s*\d+\s*ngay/.test(n) ||
        /sau\s*\d+\s*ngay/.test(n);
    if (hasWeight && hasTime) {
        const excerpt = text.slice(0, 120);
        const reason = 'OCR/media có claim giảm cân + thời gian cụ thể — dễ vi phạm Health/misleading.';
        const remediation = 'Gỡ claim số kg/thời gian tuyệt đối trên ảnh/video; thêm disclaimer.';
        findings.push({
            id: `${prefix}:weight-time-claim`,
            field: 'imageOcrText',
            excerpt,
            evidence: excerpt,
            policyGroup: 'HEALTH',
            policyCode: MEDIA_CODE,
            severity: 'HIGH',
            reason,
            explanation: reason,
            remediation,
            suggestion: remediation,
            signalCount: 2,
            signals: ['weight', 'time'],
            source: 'rule',
        });
    }
    const cure = /chua khoi|chữa khỏi|100\s*%|cam ket/.test(n);
    const treat = /dieu tri|điều trị|triet de|triệt để/.test(n);
    if (cure && treat) {
        const excerpt = text.slice(0, 120);
        const reason = 'Media chứa cam kết điều trị tuyệt đối.';
        const remediation = 'Làm lại visual/caption không cam kết chữa khỏi.';
        findings.push({
            id: `${prefix}:media-absolute-health`,
            field: 'imageOcrText',
            excerpt,
            evidence: excerpt,
            policyGroup: 'HEALTH',
            policyCode: MEDIA_CODE,
            severity: 'HIGH',
            reason,
            explanation: reason,
            remediation,
            suggestion: remediation,
            signalCount: 2,
            signals: ['cure', 'treat'],
            source: 'rule',
        });
    }
    return findings;
}
function findingsFromMediaText(text, prefix = 'media') {
    const t = (text || '').trim();
    if (!t)
        return [];
    return scanStrongMediaClaims(t, prefix);
}
function analyzePolicyTranscriptOnly(params) {
    const transcript = params.transcript?.trim() || '';
    const caption = params.caption?.trim() || '';
    const findings = findingsFromMediaText(`${caption}\n${transcript}`, 'tr');
    const insufficient = transcript.length < 20 && caption.length < 20;
    return {
        mediaType: 'transcript',
        ocrText: '',
        transcript,
        caption,
        visualNotes: [],
        regions: [],
        findings,
        insufficientData: insufficient,
        statusHint: insufficient ? 'INSUFFICIENT_DATA' : 'OK',
        message: insufficient ? 'INSUFFICIENT_DATA: transcript/caption quá ngắn' : undefined,
        warnings: insufficient ? ['Cần transcript dài hơn để phân tích video/audio.'] : [],
    };
}
async function analyzePolicyImage(params) {
    const mime = (params.mimeType || '').toLowerCase();
    if (mime && !mime.startsWith('image/')) {
        return {
            mediaType: 'image',
            ocrText: '',
            transcript: '',
            caption: params.caption || '',
            visualNotes: [],
            regions: [],
            findings: [],
            insufficientData: true,
            statusHint: 'INSUFFICIENT_DATA',
            message: 'INSUFFICIENT_DATA: MIME ảnh không hợp lệ',
            warnings: [`MIME không hỗ trợ: ${mime}`],
        };
    }
    if (params.buffer.length > 25 * 1024 * 1024) {
        return {
            mediaType: 'image',
            ocrText: '',
            transcript: '',
            caption: params.caption || '',
            visualNotes: [],
            regions: [],
            findings: [],
            insufficientData: true,
            statusHint: 'INSUFFICIENT_DATA',
            message: 'INSUFFICIENT_DATA: file vượt 25MB',
            warnings: ['Giới hạn 25MB.'],
        };
    }
    let ocrText = '';
    const warnings = [];
    if (params.openai?.isConfigured()) {
        try {
            const b64 = params.buffer.toString('base64');
            const dataUrl = `data:${mime || 'image/jpeg'};base64,${b64}`;
            const raw = await params.openai.chatCompletionVision({
                maxTokens: 400,
                temperature: 0.1,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Trích toàn bộ chữ tiếng Việt/English trên ảnh quảng cáo (OCR). Chỉ trả text, không giải thích.',
                            },
                            { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
                        ],
                    },
                ],
            });
            ocrText = (raw || '').trim().slice(0, 4000);
        }
        catch {
            warnings.push('OCR AI không khả dụng — dùng caption/manual.');
        }
    }
    else {
        warnings.push('Chưa cấu hình OpenAI — bỏ qua OCR tự động.');
    }
    const blob = `${params.caption || ''}\n${ocrText}`.trim();
    const findings = findingsFromMediaText(blob, 'img');
    const insufficient = !blob || blob.length < 8;
    return {
        mediaType: 'image',
        ocrText,
        transcript: '',
        caption: params.caption || '',
        visualNotes: ocrText ? ['ocr_extracted'] : [],
        regions: [],
        findings,
        insufficientData: insufficient,
        statusHint: insufficient ? 'INSUFFICIENT_DATA' : 'OK',
        message: insufficient
            ? 'INSUFFICIENT_DATA: không đọc được chữ trên ảnh / thiếu caption'
            : undefined,
        warnings,
    };
}
async function analyzePolicyVideo(params) {
    const mime = (params.mimeType || '').toLowerCase();
    if (params.buffer && params.buffer.length > 25 * 1024 * 1024) {
        return {
            mediaType: 'video',
            ocrText: '',
            transcript: '',
            caption: params.caption || '',
            visualNotes: [],
            regions: [],
            findings: [],
            insufficientData: true,
            statusHint: 'INSUFFICIENT_DATA',
            message: 'INSUFFICIENT_DATA: file vượt 25MB',
            warnings: ['Giới hạn 25MB.'],
        };
    }
    if (mime && params.buffer && !mime.startsWith('video/') && !mime.startsWith('image/')) {
        return {
            mediaType: 'video',
            ocrText: '',
            transcript: '',
            caption: params.caption || '',
            visualNotes: [],
            regions: [],
            findings: [],
            insufficientData: true,
            statusHint: 'INSUFFICIENT_DATA',
            message: 'INSUFFICIENT_DATA: MIME video không hợp lệ',
            warnings: [`MIME không hỗ trợ: ${mime}`],
        };
    }
    const transcript = (params.manualTranscript || '').trim();
    const caption = (params.caption || '').trim();
    // Without STT pipeline, silent/no-transcript video cannot be treated as safe.
    if (!transcript) {
        return {
            mediaType: 'video',
            ocrText: '',
            transcript: '',
            caption,
            visualNotes: ['no_audio_or_transcript'],
            regions: [],
            findings: [],
            insufficientData: true,
            statusHint: 'INSUFFICIENT_DATA',
            message: 'INSUFFICIENT_DATA: video không có transcript/audio để phân tích — dán transcript hoặc OCR.',
            warnings: ['Không suy luận an toàn khi thiếu audio/transcript. Hãy dán transcript thủ công.'],
        };
    }
    const findings = findingsFromMediaText(`${caption}\n${transcript}`, 'vid');
    return {
        mediaType: 'video',
        ocrText: '',
        transcript,
        caption,
        visualNotes: [],
        regions: [],
        findings,
        insufficientData: false,
        statusHint: 'OK',
        warnings: [],
    };
}
//# sourceMappingURL=facebook-policy-media.logic.js.map