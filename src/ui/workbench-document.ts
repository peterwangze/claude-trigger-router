const WORKBENCH_TITLE = 'Claude Trigger Router';

export function renderWorkbenchDocumentStart(title = WORKBENCH_TITLE): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeDocumentText(title)}</title><style>`;
}

export function renderWorkbenchScriptStart(): string {
  return '<script>';
}

export function renderWorkbenchDocumentEnd(): string {
  return '</body></html>';
}

export function extractWorkbenchInlineScript(html: string): string {
  return html.match(/<script>([\s\S]*)<\/script>/)?.[1] ?? '';
}

function escapeDocumentText(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
