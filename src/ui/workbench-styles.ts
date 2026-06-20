export function renderWorkbenchStyles(): string {
  return (
    `:root{color-scheme:light;--bg:#f5f5f7;--panel:#ffffff;--panel-soft:#fbfbfd;--line:#d8dce3;--line-soft:#e7e9ee;--text:#1d1d1f;--muted:#6e6e73;--brand:#0071e3;--brand-strong:#005bb5;--accent:#0a84ff;--warn:#b45f06;--critical:#b3261e;--ok:#087f5b;--shadow:0 12px 34px rgba(0,0,0,.06);--radius:8px}` +
    `*{box-sizing:border-box}` +
    `body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif;padding:1.25rem;max-width:1360px;margin:0 auto;background:var(--bg);color:var(--text);line-height:1.45;letter-spacing:0}` +
    `.app-shell{display:grid;gap:1rem;max-width:100%;overflow-x:hidden}` +
    `.app-shell>*{min-width:0;max-width:100%}` +
    `.topbar{display:flex;justify-content:space-between;gap:1rem;align-items:center;padding:.6rem .75rem;border:1px solid var(--line-soft);border-radius:var(--radius);background:rgba(255,255,255,.82);backdrop-filter:blur(16px);position:sticky;top:.75rem;z-index:5}` +
    `.brand-lockup{display:flex;gap:.55rem;align-items:center;font-size:.95rem}.brand-dot{width:.78rem;height:.78rem;border-radius:50%;background:var(--brand);box-shadow:0 0 0 4px rgba(0,113,227,.12)}` +
    `.hero{display:grid;grid-template-columns:minmax(0,.92fr) minmax(360px,1.08fr);gap:1rem;align-items:stretch;margin-bottom:.2rem;min-width:0;max-width:100%}` +
    `.hero-copy{display:flex;flex-direction:column;justify-content:space-between;gap:1rem;padding:1.4rem .25rem}` +
    `.hero h1{margin:0;font-size:2.15rem;line-height:1.12;letter-spacing:0;font-weight:720}` +
    `.hero-summary{max-width:42rem;margin:.65rem 0 0;color:var(--muted);font-size:1rem}` +
    `.local-readiness{display:inline-flex;gap:.55rem;align-items:center;width:max-content;border:1px solid var(--line);border-radius:999px;background:#fff;padding:.38rem .65rem;font-size:.86rem;box-shadow:0 1px 0 rgba(0,0,0,.03)}` +
    `.local-readiness strong{color:var(--ok)}.local-readiness[data-tone="watch"] strong{color:var(--warn)}.local-readiness[data-tone="critical"] strong{color:var(--critical)}` +
    `.panel{background:var(--panel);border:1px solid var(--line-soft);border-radius:var(--radius);padding:1rem 1.1rem;margin-bottom:1rem;box-shadow:0 1px 0 rgba(0,0,0,.02);max-width:100%;overflow-x:auto}` +
    `.status-panel{box-shadow:var(--shadow);margin-bottom:0}` +
    `.muted{color:var(--muted)}` +
    `.surface-heading{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;margin-bottom:.75rem}.surface-heading strong{font-size:1rem}.stacked-heading{display:grid;gap:.18rem}` +
    `.status-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.55rem}` +
    `.status-tile{background:var(--panel-soft);border:1px solid var(--line-soft);border-radius:var(--radius);padding:.75rem;min-width:0}` +
    `.status-tile.wide{grid-column:span 2}.status-tile strong{display:block;margin-top:.2rem;word-break:break-word;color:var(--text);font-size:.98rem}.status-tile.primary-status{background:#f2f8ff;border-color:#b9d8ff}` +
    `.workspace-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,360px);gap:1rem;align-items:start}` +
    `.quick-config-panel{box-shadow:var(--shadow)}` +
    `.quick-config-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(240px,.74fr);gap:1rem;align-items:start;margin-top:.75rem}` +
    `.quick-config-main,.provider-template-panel,.advanced-rail{background:var(--panel-soft);border:1px solid var(--line-soft);border-radius:var(--radius);padding:1rem;min-width:0}` +
    `.quick-control-grid{grid-template-columns:repeat(2,minmax(0,1fr))}` +
    `.quick-summary{display:flex;gap:.65rem;flex-wrap:wrap;align-items:center;margin-top:.85rem;padding:.75rem;border:1px dashed var(--line);border-radius:var(--radius);background:#fff;min-width:0}` +
    `.quick-summary strong,.quick-summary span{word-break:break-word}` +
    `.provider-card-grid{display:grid;grid-template-columns:1fr;gap:.55rem;margin-top:.75rem}` +
    `.provider-card{display:flex;flex-direction:column;gap:.2rem;align-items:flex-start;text-align:left;background:#fff;color:var(--text);border:1px solid var(--line-soft);border-radius:var(--radius);padding:.72rem;min-height:84px}` +
    `.provider-card:hover{background:#f5f9ff;border-color:#8bc4ff;color:var(--text)}` +
    `.provider-card span{font-size:.84rem;color:var(--muted);word-break:break-word}.provider-card small{font-size:.78rem;color:var(--muted);word-break:break-word}` +
    `.role-grid{display:grid;grid-template-columns:1fr;gap:.6rem;margin-top:.75rem;min-width:0;max-width:100%}` +
    `.role-card{background:#fff;border:1px solid var(--line-soft);border-left:3px solid var(--line);border-radius:var(--radius);padding:.85rem;min-width:0;display:flex;flex-direction:column;gap:.65rem}` +
    `.role-card.primary-role{border-left-color:var(--brand);background:#f8fbff}.role-card[data-tone="watch"]{border-left-color:var(--warn)}.role-card[data-tone="critical"]{border-left-color:var(--critical)}.role-card[data-tone="ready"]{border-left-color:var(--ok)}.role-card[data-tone="muted"]{border-left-color:#a1a1aa}` +
    `.role-card h2{font-size:.96rem;margin:0}.role-card p{margin:.2rem 0 0;color:var(--muted);font-size:.9rem}` +
    `.role-meta{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-top:auto}.role-footnote{display:flex;justify-content:space-between;gap:.6rem;border-top:1px solid var(--line-soft);padding-top:.52rem;font-size:.82rem}.role-footnote strong{font-size:.82rem;word-break:break-word}` +
    `.task-map{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:1rem;margin-bottom:1rem;min-width:0;max-width:100%}` +
    `.ux-checklist{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}` +
    `.ux-check{background:var(--panel-soft);border:1px solid var(--line-soft);border-radius:var(--radius);padding:.75rem;min-width:0}` +
    `.ux-check strong{display:block;margin-bottom:.25rem}.ux-check[data-state="ready"] strong{color:var(--ok)}.ux-check[data-state="watch"] strong{color:var(--warn)}.ux-check[data-state="critical"] strong{color:var(--critical)}` +
    `.advanced-section{margin-top:1rem;border:1px solid var(--line-soft);border-radius:var(--radius);background:#fff;padding:.35rem}` +
    `.advanced-section>summary{cursor:pointer;font-weight:680;padding:.75rem .85rem;border-radius:6px;color:var(--text);list-style:none}` +
    `.advanced-section>summary::-webkit-details-marker{display:none}.advanced-section[open]>summary{background:#f2f2f7;color:var(--text)}` +
    `.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem;margin-top:1rem}` +
    `.stat{background:var(--panel-soft);border:1px solid var(--line-soft);border-radius:var(--radius);padding:.85rem}.stat strong{display:block;font-size:1.08rem;margin-top:.25rem}` +
    `.subpanel{margin-top:1rem;padding-top:1rem;border-top:1px solid var(--line-soft)}` +
    `.decision-rail{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem;margin:.75rem 0 1rem}` +
    `.decision-signal{background:var(--panel-soft);border:1px solid var(--line-soft);border-left:3px solid var(--ok);border-radius:var(--radius);padding:.8rem;min-width:0}` +
    `.decision-signal[data-state="watch"]{border-left-color:var(--warn)}.decision-signal[data-state="critical"]{border-left-color:var(--critical)}.decision-signal strong{display:block;margin:.15rem 0;word-break:break-word}.decision-signal .muted{font-size:.9rem}` +
    `.bucket-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.75rem;margin-top:.75rem}` +
    `.detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;margin-top:1rem}` +
    `.mini-list{list-style:none;padding:0;margin:.75rem 0 0}` +
    `.mini-list li{display:flex;justify-content:space-between;gap:.75rem 1rem;flex-wrap:wrap;align-items:flex-start;padding:.45rem 0;border-bottom:1px dashed var(--line-soft)}` +
    `.mini-list li:last-child{border-bottom:none}` +
    `.action-row{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;margin-top:.75rem}` +
    `.management-table{width:100%;margin-top:.75rem}` +
    `.management-table th,.management-table td{padding:.5rem;border-bottom:1px solid var(--line-soft);font-size:.92rem;vertical-align:top}` +
    `.scope-guide{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:.75rem;margin-top:.75rem}` +
    `.scope-guide div{background:var(--panel-soft);border:1px solid var(--line-soft);border-radius:var(--radius);padding:.75rem}` +
    `.scope-guide strong{display:block;margin-bottom:.35rem}` +
    `.alert-list{display:grid;gap:.75rem;margin-top:1rem}` +
    `.alert{border-radius:var(--radius);padding:.85rem 1rem;border:1px solid}` +
    `.alert.warn{background:#fff8ef;border-color:#ffd8a8;color:#8a3f00}` +
    `.alert.critical{background:#fff2f2;border-color:#ffb4ab;color:#8c1d18}` +
    `.alert.info{background:#f2f8ff;border-color:#b9d8ff;color:#005bb5}` +
    `.diff-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.75rem;margin-top:.75rem}` +
    `.diff-chip{background:var(--panel-soft);border:1px solid var(--line-soft);border-radius:var(--radius);padding:.75rem}.diff-chip strong{display:block;font-size:1rem;margin-top:.2rem}` +
    `.models-form-grid{display:grid;gap:.75rem;margin-top:.75rem}` +
    `.model-card{border:1px solid var(--line-soft);border-radius:var(--radius);padding:1rem;background:#fcfcfd}` +
    `.model-card-header{display:flex;justify-content:space-between;gap:1rem;align-items:center;margin-bottom:.75rem}` +
    `.model-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.75rem}` +
    `.model-card-grid textarea{min-height:84px;resize:vertical}` +
    `.list-editor{display:grid;gap:.75rem;margin-top:.75rem}` +
    `.list-item{border:1px solid var(--line-soft);border-radius:var(--radius);padding:.85rem;background:#fcfcfd}` +
    `.list-item-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.75rem}` +
    `.jump-highlight{outline:3px solid rgba(0,113,227,.8);box-shadow:0 0 0 6px rgba(0,113,227,.14);transition:box-shadow .25s ease,outline-color .25s ease}` +
    `.control-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem;margin-top:1rem}` +
    `.control-grid label{display:block;font-size:.84rem;color:var(--muted);margin-bottom:.35rem}` +
    `.trend-table{width:100%;margin-top:.75rem}` +
    `.trend-table th,.trend-table td{padding:.45rem;border-bottom:1px solid var(--line-soft);font-size:.92rem}` +
    `.row{display:flex;gap:1rem;flex-wrap:wrap;align-items:center}` +
    `input,select,textarea,button{font:inherit;font-size:.92rem;padding:.55rem .75rem;border-radius:var(--radius);border:1px solid #c7c7cc;max-width:100%;letter-spacing:0}` +
    `input,select,textarea{background:#fff;color:var(--text)}input:focus,select:focus,textarea:focus,button:focus-visible{outline:3px solid rgba(0,113,227,.18);border-color:var(--brand)}` +
    `button{background:var(--brand);color:#fff;border-color:var(--brand);cursor:pointer;font-weight:660}` +
    `button:hover{background:var(--brand-strong);border-color:var(--brand-strong)}` +
    `button.secondary{background:#fff;color:var(--text);border-color:#c7c7cc}` +
    `button.secondary:hover{background:#f5f5f7;border-color:#a6a6ad}` +
    `table{width:100%;max-width:100%;border-collapse:collapse;margin-top:1rem}` +
    `th,td{text-align:left;padding:.65rem .5rem;border-bottom:1px solid var(--line-soft);vertical-align:top}` +
    `code,pre{font-family:ui-monospace,SFMono-Regular,monospace}` +
    `pre{white-space:pre-wrap;background:#1d1d1f;color:#f5f5f7;padding:1rem;border-radius:var(--radius);overflow:auto}` +
    `.pill{display:inline-block;padding:.18rem .48rem;border-radius:999px;background:#eef2ff;color:#2f3a8f;font-size:.78rem;font-weight:660}` +
    `.pill.info{background:#eef6ff;color:#005bb5}.pill.warn{background:#fff8ef;color:#8a3f00}.pill.critical{background:#fff2f2;color:#8c1d18}` +
    `.surface-tabs{display:flex;gap:.35rem;flex-wrap:wrap;margin:.15rem 0 1rem;position:sticky;top:4.45rem;z-index:4;background:rgba(245,245,247,.86);backdrop-filter:blur(14px);padding:.28rem;border:1px solid var(--line-soft);border-radius:var(--radius);min-width:0;max-width:max-content}` +
    `.surface-tab{background:transparent;color:var(--muted);border-color:transparent}` +
    `.surface-tab.active{background:#fff;color:var(--text);border-color:var(--line-soft);box-shadow:0 1px 2px rgba(0,0,0,.05)}` +
    `.surface-panel[hidden]{display:none}` +
    `@media (max-width:1080px){.hero,.workspace-grid,.quick-config-grid{grid-template-columns:1fr}.advanced-rail{order:2}.provider-card-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}}` +
    `@media (max-width:760px){body{padding:.75rem}.topbar{position:static;align-items:stretch;flex-direction:column}.hero-copy{padding:.4rem 0}.hero h1{font-size:1.72rem}.status-grid,.role-grid,.ux-checklist,.decision-rail,.quick-control-grid{grid-template-columns:1fr}.status-tile.wide{grid-column:auto}.hero-actions,.action-row,.row{align-items:stretch}.hero-actions button,.action-row button,.surface-tab{width:100%}.surface-tabs{position:static;max-width:100%}.management-table,.trend-table,table{display:block;overflow-x:auto;white-space:nowrap}.panel{padding:.9rem}.provider-card-grid{grid-template-columns:1fr}.advanced-section>summary{max-width:100%}}`
  );
}
