export function renderWorkbenchStyles(): string {
  return (
    `:root{color-scheme:light;--bg:#f4f6f8;--panel:#ffffff;--panel-soft:#f9fafb;--line:#d9dee7;--line-soft:#e7ebf0;--text:#172033;--muted:#647084;--brand:#0f766e;--brand-strong:#115e59;--accent:#2563eb;--warn:#b45309;--critical:#b91c1c;--ok:#047857;--shadow:0 12px 32px rgba(15,23,42,.08)}` +
    `*{box-sizing:border-box}` +
    `body{font-family:ui-sans-serif,system-ui,sans-serif;padding:1.5rem;max-width:1280px;margin:0 auto;background:var(--bg);color:var(--text);line-height:1.45}` +
    `.panel{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:1rem 1.25rem;margin-bottom:1rem;box-shadow:0 1px 0 rgba(15,23,42,.03);max-width:100%;overflow-x:auto}` +
    `.muted{color:var(--muted)}` +
    `.app-shell{display:grid;gap:1rem;max-width:100%;overflow-x:hidden}` +
    `.app-shell>*{min-width:0;max-width:100%}` +
    `.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.62fr);gap:1rem;align-items:stretch;margin-bottom:1rem;min-width:0;max-width:100%}` +
    `.hero h1{margin:0;font-size:1.7rem;line-height:1.2;letter-spacing:0}` +
    `.hero-copy{display:flex;flex-direction:column;justify-content:space-between;gap:1rem}` +
    `.eyebrow{font-size:.78rem;font-weight:700;text-transform:uppercase;color:var(--brand);letter-spacing:.08em}` +
    `.hero-summary{max-width:62rem;margin:.5rem 0 0;color:var(--muted)}` +
    `.hero-actions{display:flex;gap:.65rem;flex-wrap:wrap;align-items:center}` +
    `.status-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}` +
    `.status-tile{background:var(--panel-soft);border:1px solid var(--line-soft);border-radius:8px;padding:.75rem;min-width:0}` +
    `.status-tile strong{display:block;margin-top:.2rem;word-break:break-word;color:var(--text)}` +
    `.role-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin-bottom:1rem;min-width:0;max-width:100%}` +
    `.role-card{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--brand);border-radius:8px;padding:1rem;min-width:0;display:flex;flex-direction:column;gap:.75rem;box-shadow:0 1px 0 rgba(15,23,42,.03)}` +
    `.role-card[data-tone="watch"]{border-left-color:var(--warn)}.role-card[data-tone="critical"]{border-left-color:var(--critical)}.role-card[data-tone="ready"]{border-left-color:var(--ok)}.role-card[data-tone="muted"]{border-left-color:#94a3b8}` +
    `.role-card h2{font-size:1rem;margin:0}.role-card p{margin:0;color:var(--muted);font-size:.92rem}` +
    `.role-meta{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-top:auto}` +
    `.task-map{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:1rem;margin-bottom:1rem;min-width:0;max-width:100%}` +
    `.ux-checklist{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}` +
    `.ux-check{background:var(--panel-soft);border:1px solid var(--line-soft);border-radius:8px;padding:.75rem;min-width:0}` +
    `.ux-check strong{display:block;margin-bottom:.25rem}.ux-check[data-state="ready"] strong{color:var(--ok)}.ux-check[data-state="watch"] strong{color:var(--warn)}.ux-check[data-state="critical"] strong{color:var(--critical)}` +
    `@media (max-width:980px){.hero,.task-map{grid-template-columns:1fr}.role-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}` +
    `@media (max-width:760px){body{padding:.75rem}.role-grid,.ux-checklist,.status-grid{grid-template-columns:1fr}.hero-actions,.action-row,.row{align-items:stretch}.hero-actions button,.action-row button,.surface-tab{width:100%}.management-table,.trend-table,table{display:block;overflow-x:auto;white-space:nowrap}.panel{padding:.9rem}}` +
    `.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem;margin-top:1rem}` +
    `.stat{background:var(--panel-soft);border:1px solid var(--line-soft);border-radius:8px;padding:.85rem}` +
    `.stat strong{display:block;font-size:1.1rem;margin-top:.25rem}` +
    `.subpanel{margin-top:1rem;padding-top:1rem;border-top:1px solid var(--line-soft)}` +
    `.bucket-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.75rem;margin-top:.75rem}` +
    `.detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;margin-top:1rem}` +
    `.mini-list{list-style:none;padding:0;margin:.75rem 0 0}` +
    `.mini-list li{display:flex;justify-content:space-between;gap:.75rem 1rem;flex-wrap:wrap;align-items:flex-start;padding:.45rem 0;border-bottom:1px dashed var(--line-soft)}` +
    `.mini-list li:last-child{border-bottom:none}` +
    `.action-row{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;margin-top:.75rem}` +
    `.management-table{width:100%;margin-top:.75rem}` +
    `.management-table th,.management-table td{padding:.5rem;border-bottom:1px solid var(--line-soft);font-size:.92rem;vertical-align:top}` +
    `.scope-guide{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:.75rem;margin-top:.75rem}` +
    `.scope-guide div{background:var(--panel-soft);border:1px solid var(--line-soft);border-radius:8px;padding:.75rem}` +
    `.scope-guide strong{display:block;margin-bottom:.35rem}` +
    `.alert-list{display:grid;gap:.75rem;margin-top:1rem}` +
    `.alert{border-radius:8px;padding:.85rem 1rem;border:1px solid}` +
    `.alert.warn{background:#fff7ed;border-color:#fdba74;color:#9a3412}` +
    `.alert.critical{background:#fef2f2;border-color:#fca5a5;color:#991b1b}` +
    `.alert.info{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8}` +
    `.diff-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.75rem;margin-top:.75rem}` +
    `.diff-chip{background:var(--panel-soft);border:1px solid var(--line-soft);border-radius:8px;padding:.75rem}` +
    `.diff-chip strong{display:block;font-size:1rem;margin-top:.2rem}` +
    `.models-form-grid{display:grid;gap:.75rem;margin-top:.75rem}` +
    `.model-card{border:1px solid var(--line-soft);border-radius:8px;padding:1rem;background:#fcfcfd}` +
    `.model-card-header{display:flex;justify-content:space-between;gap:1rem;align-items:center;margin-bottom:.75rem}` +
    `.model-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.75rem}` +
    `.model-card-grid textarea{min-height:84px;resize:vertical}` +
    `.list-editor{display:grid;gap:.75rem;margin-top:.75rem}` +
    `.list-item{border:1px solid var(--line-soft);border-radius:8px;padding:.85rem;background:#fcfcfd}` +
    `.list-item-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.75rem}` +
    `.jump-highlight{outline:3px solid #f59e0b;box-shadow:0 0 0 6px rgba(245,158,11,.15);transition:box-shadow .25s ease,outline-color .25s ease}` +
    `.control-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem;margin-top:1rem}` +
    `.control-grid label{display:block;font-size:.85rem;color:var(--muted);margin-bottom:.35rem}` +
    `.trend-table{width:100%;margin-top:.75rem}` +
    `.trend-table th,.trend-table td{padding:.45rem;border-bottom:1px solid var(--line-soft);font-size:.92rem}` +
    `.row{display:flex;gap:1rem;flex-wrap:wrap;align-items:center}` +
    `input,select,textarea,button{font:inherit;padding:.55rem .75rem;border-radius:8px;border:1px solid #cbd5e1;max-width:100%}` +
    `input,select,textarea{background:#fff;color:var(--text)}` +
    `button{background:var(--brand);color:#fff;border-color:var(--brand);cursor:pointer;font-weight:650}` +
    `button:hover{background:var(--brand-strong);border-color:var(--brand-strong)}` +
    `button.secondary{background:#fff;color:var(--text);border-color:#cbd5e1}` +
    `button.secondary:hover{background:#f8fafc;border-color:#94a3b8}` +
    `table{width:100%;max-width:100%;border-collapse:collapse;margin-top:1rem}` +
    `th,td{text-align:left;padding:.65rem .5rem;border-bottom:1px solid var(--line-soft);vertical-align:top}` +
    `code,pre{font-family:ui-monospace,SFMono-Regular,monospace}` +
    `pre{white-space:pre-wrap;background:#172033;color:#e2e8f0;padding:1rem;border-radius:8px;overflow:auto}` +
    `.pill{display:inline-block;padding:.2rem .5rem;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:.8rem;font-weight:650}` +
    `.pill.info{background:#eff6ff;color:#1d4ed8}.pill.warn{background:#fff7ed;color:#9a3412}.pill.critical{background:#fef2f2;color:#991b1b}` +
    `.surface-tabs{display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0;position:sticky;top:.5rem;z-index:4;background:rgba(244,246,248,.9);backdrop-filter:blur(8px);padding:.4rem;border:1px solid var(--line-soft);border-radius:8px;min-width:0;max-width:100%}` +
    `.surface-tab{background:#fff;color:var(--text);border-color:#cbd5e1}` +
    `.surface-tab.active{background:#172033;color:#fff;border-color:#172033}` +
    `.surface-panel[hidden]{display:none}` +
    `.surface-heading{display:flex;gap:1rem;flex-wrap:wrap;align-items:center;margin-bottom:.75rem}`
  );
}
