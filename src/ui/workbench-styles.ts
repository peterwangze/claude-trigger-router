export function renderWorkbenchStyles(): string {
  return (
    `:root{color-scheme:light;--bg:#f6f7fb;--panel:#ffffff;--panel-soft:#fbfcff;--line:#d9dde6;--line-soft:#eaedf3;--text:#17181c;--muted:#707582;--brand:#1f67db;--brand-strong:#1554b9;--accent:#0a84ff;--warn:#b45f06;--critical:#b3261e;--ok:#24a148;--shadow:0 18px 48px rgba(28,35,54,.08);--soft-shadow:0 1px 2px rgba(28,35,54,.04);--radius:8px}` +
    `*{box-sizing:border-box}` +
    `body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif;padding:.45rem;max-width:1520px;margin:0 auto;background:var(--bg);color:var(--text);line-height:1.45;letter-spacing:0}` +
    `.app-shell{display:grid;gap:.75rem;max-width:100%;overflow-x:hidden;background:rgba(255,255,255,.62);border:1px solid var(--line-soft);border-radius:var(--radius);box-shadow:var(--shadow);padding:.85rem}` +
    `.app-shell>*{min-width:0;max-width:100%}` +
    `.topbar{display:grid;grid-template-columns:auto minmax(260px,1fr) auto;gap:1rem;align-items:center;padding:.45rem .65rem .58rem;border-bottom:1px solid var(--line-soft);background:rgba(255,255,255,.78);backdrop-filter:blur(16px);position:sticky;top:.45rem;z-index:5}` +
    `.brand-lockup{display:flex;gap:.55rem;align-items:center;font-size:.95rem}.brand-dot{width:.78rem;height:.78rem;border-radius:50%;background:var(--brand);box-shadow:0 0 0 4px rgba(0,113,227,.12)}` +
    `.topbar-status{display:inline-flex;justify-self:end;align-items:center;gap:.45rem;color:var(--text);font-size:.9rem;white-space:nowrap}.status-dot{width:.45rem;height:.45rem;border-radius:50%;background:var(--ok);box-shadow:0 0 0 4px rgba(36,161,72,.12)}` +
    `.hero{display:block;margin:.35rem 0 .15rem;min-width:0;max-width:100%}` +
    `.hero h1{margin:0;font-size:1.02rem;line-height:1.15;letter-spacing:0;font-weight:720}` +
    `.panel{background:var(--panel);border:1px solid var(--line-soft);border-radius:var(--radius);padding:.9rem 1rem;margin-bottom:.75rem;box-shadow:var(--soft-shadow);max-width:100%;overflow-x:auto}` +
    `.status-panel{box-shadow:none;margin-bottom:0;padding:0;overflow:hidden}` +
    `.status-panel-head{display:flex;align-items:center;gap:.8rem;padding:.78rem 1rem;border-bottom:1px solid var(--line-soft)}` +
    `.status-strip{display:grid;grid-template-columns:1.05fr 1fr 1fr 1fr 1.25fr auto;align-items:center;gap:0;padding:.82rem 1rem}` +
    `.status-footnote{display:flex;gap:.45rem .9rem;flex-wrap:wrap;padding:0 1rem .75rem;color:var(--muted);font-size:.82rem}.status-footnote strong{color:var(--text);font-weight:650}` +
    `.muted{color:var(--muted);overflow-wrap:anywhere}` +
    `.surface-heading{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;margin-bottom:.75rem}.surface-heading strong{font-size:1rem}.stacked-heading{display:grid;gap:.18rem}` +
    `.status-tile{background:transparent;border-right:1px solid var(--line-soft);padding:.2rem 1rem;min-width:0}` +
    `.status-tile:last-of-type{border-right:none}.status-tile strong{display:block;margin-top:.2rem;word-break:break-word;color:var(--text);font-size:.98rem}.status-tile.primary-status strong{color:var(--ok)}` +
    `.workspace-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(290px,340px);gap:1rem;align-items:start}` +
    `.primary-workspace{min-width:0}` +
    `.quick-config-panel{box-shadow:none}` +
    `.quick-config-grid{display:block;margin-top:.55rem}` +
    `.quick-config-main,.advanced-rail{background:transparent;border:0;border-radius:0;padding:0;min-width:0}` +
    `.provider-template-panel{background:var(--panel);border:1px solid var(--line-soft);border-radius:var(--radius);padding:.9rem 1rem;min-width:0;margin-bottom:.75rem;box-shadow:var(--soft-shadow)}` +
    `.quick-control-grid{grid-template-columns:130px minmax(0,1fr);align-items:center;gap:.55rem .75rem}` +
    `.quick-control-grid>div{display:grid;grid-template-columns:130px minmax(0,1fr);grid-column:1/-1;align-items:center;gap:.65rem}.quick-control-grid label{margin-bottom:0;color:var(--text);font-weight:650}` +
    `.quick-summary{display:flex;gap:.65rem;flex-wrap:wrap;align-items:center;margin-top:.65rem;padding:.62rem .75rem;border:1px dashed var(--line);border-radius:var(--radius);background:#fff;min-width:0}` +
    `.quick-summary strong,.quick-summary span{word-break:break-word}` +
    `.config-route-grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:.75rem;margin-top:.75rem}` +
    `.config-live-panel{background:#fff;border:1px solid var(--line-soft);border-radius:var(--radius);padding:.78rem;min-width:0;overflow:hidden}` +
    `.config-live-panel .row{justify-content:space-between;gap:.5rem}.config-snapshot{margin:.65rem 0 0;max-height:210px;background:#f5f5f7;color:var(--text);border:1px solid var(--line-soft);font-size:.78rem;line-height:1.42}` +
    `.route-path-diagram{display:grid;grid-template-columns:repeat(9,max-content);align-items:stretch;gap:.35rem;margin-top:.65rem;overflow-x:auto;padding-bottom:.2rem}` +
    `.route-node{min-width:112px;max-width:170px;border:1px solid var(--line-soft);border-radius:var(--radius);background:#f7f8fb;padding:.58rem .65rem;display:grid;gap:.18rem;align-content:start}.route-node span{color:var(--muted);font-size:.75rem}.route-node strong{font-size:.84rem;line-height:1.25;word-break:break-word}` +
    `.route-node-pending{background:#f2f8ff;border-color:#b9d8ff}.route-edge{display:grid;place-items:center;color:var(--muted);font-weight:700;min-width:18px}` +
    `.provider-template-groups{display:grid;gap:.85rem;margin-top:.62rem}.provider-category-section{display:grid;gap:.55rem}.provider-category-heading{display:flex;gap:.65rem;align-items:baseline;flex-wrap:wrap}` +
    `.provider-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem}` +
    `.provider-card{display:flex;flex-direction:column;justify-content:space-between;gap:.45rem;align-items:flex-start;text-align:left;background:#fff;color:var(--text);border:1px solid var(--line-soft);border-radius:var(--radius);padding:.85rem;min-height:116px;box-shadow:var(--soft-shadow)}` +
    `.provider-card:hover{background:#f8fbff;border-color:#9dc9ff;color:var(--text);transform:translateY(-1px)}` +
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
    `code,pre{font-family:ui-monospace,SFMono-Regular,monospace;overflow-wrap:anywhere;word-break:break-word}` +
    `pre{white-space:pre-wrap;background:#1d1d1f;color:#f5f5f7;padding:1rem;border-radius:var(--radius);overflow:auto}` +
    `.pill{display:inline-block;padding:.18rem .48rem;border-radius:999px;background:#eef2ff;color:#2f3a8f;font-size:.78rem;font-weight:660}` +
    `.pill.info{background:#eef6ff;color:#005bb5}.pill.warn{background:#fff8ef;color:#8a3f00}.pill.critical{background:#fff2f2;color:#8c1d18}` +
    `.surface-tabs{display:flex;gap:1.1rem;justify-self:start;align-self:stretch;align-items:center;flex-wrap:wrap;margin:0;background:transparent;padding:0;border:0;border-radius:0;min-width:0;max-width:100%}` +
    `.surface-tab{height:100%;background:transparent;color:var(--muted);border:0;border-bottom:2px solid transparent;border-radius:0;padding:.55rem .15rem .5rem;font-weight:700}` +
    `.surface-tab:hover{background:transparent;color:var(--text);border-color:transparent}` +
    `.surface-tab.active{background:transparent;color:var(--brand);border-bottom-color:var(--brand);box-shadow:none}` +
    `.surface-panel[hidden]{display:none}` +
    `@media (max-width:1080px){.topbar{grid-template-columns:1fr}.topbar-status{justify-self:start}.workspace-grid{grid-template-columns:1fr}.advanced-rail{order:2}.provider-card-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}.status-strip{grid-template-columns:repeat(2,minmax(0,1fr)) auto}.status-tile:nth-of-type(2n){border-right:0}}` +
    `@media (max-width:760px){body{padding:.35rem}.app-shell{padding:.65rem}.topbar{position:static;align-items:stretch}.surface-tabs{gap:.35rem}.surface-tab{height:auto;border:1px solid var(--line-soft);border-radius:var(--radius);padding:.5rem .7rem}.surface-tab.active{background:#fff;border-color:var(--line-soft);border-bottom-color:var(--line-soft)}.hero h1{font-size:1rem}.status-strip,.role-grid,.ux-checklist,.decision-rail,.config-route-grid{grid-template-columns:1fr}.route-path-diagram{grid-template-columns:1fr}.route-edge{min-height:18px}.status-tile,.status-tile:nth-of-type(2n){border-right:0;border-bottom:1px solid var(--line-soft);padding:.65rem 0}.status-tile:last-of-type{border-bottom:0}.quick-control-grid,.quick-control-grid>div{grid-template-columns:1fr}.hero-actions,.action-row,.row{align-items:stretch}.hero-actions button,.action-row button,.surface-tab{width:100%}.management-table,.trend-table,table{display:block;overflow-x:auto;white-space:nowrap}.panel{padding:.9rem}.provider-card-grid{grid-template-columns:1fr}.advanced-section>summary{max-width:100%}}`
  );
}
