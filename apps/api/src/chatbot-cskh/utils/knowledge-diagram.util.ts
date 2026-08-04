export const KNOWLEDGE_DIAGRAM_URL = 'internal://knowledge-diagram';

export type KnowledgeDiagramNode = {
  title: string;
  content: string;
};

export function formatDiagramNodeContent(node: KnowledgeDiagramNode): string {
  const title = node.title.trim();
  const body = node.content.trim();
  if (!body) return title;
  if (body.startsWith(title)) return body;
  return `${title}\n\n${body}`;
}

function parseMarkdownNodes(text: string, defaultTitle: string): KnowledgeDiagramNode[] {
  const lines = text.split(/\r?\n/);
  const nodes: KnowledgeDiagramNode[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  const flush = () => {
    const content = currentLines.join('\n').trim();
    const title = (currentTitle || defaultTitle).trim();
    if (title || content) {
      nodes.push({ title: title || defaultTitle, content: content || title });
    }
    currentTitle = '';
    currentLines = [];
  };

  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      flush();
    if (heading?.[1]) {
      currentTitle = heading[1].trim();
    }
      continue;
    }
    currentLines.push(line);
  }
  flush();
  return nodes.filter((n) => n.title.trim() || n.content.trim());
}

function parseCsvNodes(text: string, defaultTitle: string): KnowledgeDiagramNode[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length < 2) return [];

  const headerRow = rows[0];
  if (!headerRow) return [];

  const header = headerRow.split(',').map((h) => h.trim().toLowerCase());
  const titleIdx = header.indexOf('title');
  const contentIdx = header.findIndex((h) => h === 'content' || h === 'body');
  if (titleIdx < 0 || contentIdx < 0) return [];

  return rows.slice(1).map((row) => {
    const cols = row.split(',').map((c) => c.trim());
    return {
      title: cols[titleIdx] || defaultTitle,
      content: cols[contentIdx] || cols[titleIdx] || defaultTitle,
    };
  });
}

function parseJsonNodes(text: string, defaultTitle: string): KnowledgeDiagramNode[] {
  const parsed = JSON.parse(text) as { nodes?: Array<{ title?: string; content?: string }> };
  if (!Array.isArray(parsed.nodes)) return [];
  return parsed.nodes
    .map((node) => ({
      title: (node.title || defaultTitle).trim(),
      content: (node.content || node.title || defaultTitle).trim(),
    }))
    .filter((node) => node.title || node.content);
}

export function parseKnowledgeDiagramFile(params: {
  filename: string;
  text: string;
  defaultTitle: string;
}): KnowledgeDiagramNode[] {
  const text = params.text.trim();
  if (!text) return [];

  const defaultTitle = params.defaultTitle.trim() || 'Sơ đồ tri thức';
  const lowerName = (params.filename || '').toLowerCase();

  if (lowerName.endsWith('.json')) {
    try {
      return parseJsonNodes(text, defaultTitle);
    } catch {
      throw new Error('JSON không hợp lệ — cần { "nodes": [{ "title", "content" }] }.');
    }
  }

  if (lowerName.endsWith('.csv')) {
    const csvNodes = parseCsvNodes(text, defaultTitle);
    if (csvNodes.length) return csvNodes;
  }

  const markdownNodes = parseMarkdownNodes(text, defaultTitle);
  if (markdownNodes.length) return markdownNodes;

  if (lowerName.endsWith('.csv')) {
    throw new Error('CSV cần header title,content.');
  }

  return [{ title: defaultTitle, content: text }];
}
