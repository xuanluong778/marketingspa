/** Render {{var}} placeholders */
export function renderTemplate(body: string, context: Record<string, string>): string {
  let rendered = body;
  for (const [key, value] of Object.entries(context)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }
  return rendered;
}
