export type PresetTemplateCategory = 'welcome' | 'nurturing' | 'voucher' | 'birthday' | 'reengagement';

export type PresetEmailTemplate = {
  category: PresetTemplateCategory;
  name: string;
  subject: string;
  previewText: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
};

export const PRESET_EMAIL_TEMPLATES: PresetEmailTemplate[] = [
  {
    category: 'welcome',
    name: 'Sẵn có: Welcome',
    subject: '{{firstName}} ơi, chào mừng bạn đến với {{company}}',
    previewText: 'Mở email để xem ưu đãi dành cho khách mới.',
    heading: 'Xin chào {{firstName}},',
    body: 'Cảm ơn bạn đã để lại thông tin. Đội ngũ {{company}} rất vui được đồng hành cùng bạn.\n\nBạn có thể trả lời email này khi muốn được tư vấn liệu trình phù hợp.',
    ctaLabel: 'Đặt lịch tư vấn',
    ctaUrl: 'https://marketingautoaz.com',
  },
  {
    category: 'nurturing',
    name: 'Sẵn có: Lead Nurturing',
    subject: '{{firstName}} ơi, {{company}} gửi bạn 3 lưu ý chăm da tuần này',
    previewText: 'Mẹo ngắn + khung giờ trống để bạn đặt lịch.',
    heading: 'Dành riêng cho {{firstName}}',
    body: 'Nếu bạn đang cân nhắc liệu trình, hãy bắt đầu với buổi tư vấn 15 phút — không phát sinh chi phí.\n\nInbox này cũng là nơi {{company}} gửi ưu đãi theo nhu cầu của bạn.',
    ctaLabel: 'Chọn khung giờ',
    ctaUrl: 'https://marketingautoaz.com',
  },
  {
    category: 'voucher',
    name: 'Sẵn có: Voucher',
    subject: '{{firstName}} nhận voucher cảm ơn từ {{company}}',
    previewText: 'Ưu đãi dành cho khách đã đồng hành cùng chúng tôi.',
    heading: 'Một lời cảm ơn gửi {{firstName}}',
    body: 'Cảm ơn bạn đã tin tưởng {{company}}. Chúng tôi gửi bạn ưu đãi để dành cho lần trải nghiệm tiếp theo.\n\nĐưa mã khi đặt lịch: CAMON-{{firstName}}',
    ctaLabel: 'Dùng voucher',
    ctaUrl: 'https://marketingautoaz.com',
  },
  {
    category: 'birthday',
    name: 'Sẵn có: Birthday',
    subject: 'Chúc mừng sinh nhật {{firstName}} — quà từ {{company}}',
    previewText: 'Một món quà nhỏ cho ngày đặc biệt của bạn.',
    heading: 'Chúc mừng sinh nhật {{firstName}}!',
    body: '{{company}} chúc bạn một năm mới thật rạng rỡ. Đến spa trong tháng sinh nhật để nhận liệu trình tri ân.',
    ctaLabel: 'Nhận quà sinh nhật',
    ctaUrl: 'https://marketingautoaz.com',
  },
  {
    category: 'reengagement',
    name: 'Sẵn có: Re-engagement',
    subject: '{{firstName}} ơi, {{company}} còn giữ chỗ cho bạn',
    previewText: 'Bạn chưa mở email trước — đây là lời nhắc nhẹ.',
    heading: '{{firstName}} ơi, mình nhắc bạn một chút',
    body: 'Bạn chưa xem email trước của {{company}}. Nếu vẫn quan tâm, hãy mở lịch trống tuần này — chúng tôi giữ ưu đãi đến hết tuần.',
    ctaLabel: 'Xem lịch trống',
    ctaUrl: 'https://marketingautoaz.com',
  },
];

export function presetCategoryKey(category: PresetTemplateCategory) {
  return `preset:${category}`;
}

export function compilePresetHtml(preset: PresetEmailTemplate): string {
  const paragraphs = preset.body
    .split(/\n+/)
    .map(
      (p) =>
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;font-family:Arial,sans-serif">${escapeHtml(p)}</p>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff">
  <tr><td style="padding:28px 28px 8px">
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#111827;font-family:Arial,sans-serif">${escapeHtml(preset.heading)}</h1>
    ${paragraphs}
    <p style="margin:20px 0 0">
      <a href="${escapeHtml(preset.ctaUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-family:Arial,sans-serif">${escapeHtml(preset.ctaLabel)}</a>
    </p>
  </td></tr>
  <tr><td style="padding:8px 28px 28px;font-size:12px;color:#6b7280;font-family:Arial,sans-serif">Bạn nhận email này vì đã để lại thông tin liên hệ tại {{company}}.</td></tr>
</table>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
