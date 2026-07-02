export const TEMPLATE_VARIABLES = [
  { key: 'customer_name', placeholder: '{{customer_name}}', label: 'Tên khách hàng' },
  { key: 'appointment_time', placeholder: '{{appointment_time}}', label: 'Thời gian hẹn' },
  { key: 'branch_name', placeholder: '{{branch_name}}', label: 'Chi nhánh' },
  { key: 'service_name', placeholder: '{{service_name}}', label: 'Dịch vụ' },
] as const;

export type TemplateVariableKey = (typeof TEMPLATE_VARIABLES)[number]['key'];

export interface TemplateRenderContext {
  customer_name?: string;
  appointment_time?: string;
  branch_name?: string;
  service_name?: string;
  [key: string]: string | undefined;
}

export function renderTemplate(body: string, context: TemplateRenderContext): string {
  let rendered = body;
  for (const [key, value] of Object.entries(context)) {
    if (value == null) continue;
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }
  return rendered;
}

export function extractTemplateVariables(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, '')))];
}
