import type { ReportData } from '../data';

/**
 * Responsive, self-contained HTML shell with print-friendly CSS (no external
 * assets). Supports English (LTR) and Arabic (RTL). Arabic rendering rules:
 *   - dir/lang set on <html> so the whole document flows right-to-left.
 *   - an Arabic-capable font stack (system fonts, no network).
 *   - letter-spacing is disabled in RTL to avoid broken glyph joining.
 *   - numbers and URLs stay LTR-isolated so digits are never mirrored.
 *   - long URLs wrap (overflow-wrap) so nothing is clipped in the PDF.
 */
export function layout(title: string, data: ReportData, body: string): string {
  const branding = data.branding;
  const rtl = data.lang === 'ar';
  const contact = Object.entries(branding.contactDetails)
    .map(([key, value]) => `${escapeHtml(key)}: ${escapeHtml(value)}`)
    .join(' &middot; ');
  const footer = branding.footer ? escapeHtml(branding.footer) : '';
  const logo = (url: string, alt: string) =>
    url ? `<img class="brand-logo" src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" />` : '';

  return `<!doctype html>
<html lang="${rtl ? 'ar' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
:root{--ink:#1a2433;--muted:#5b6b7f;--line:#e3e9f0;--bg:#f6f8fb;--card:#ffffff;--brand:#0f6fff;--ok:#16a34a;--warn:#d97706;--bad:#dc2626;}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
html[dir="rtl"],html[dir="rtl"] body{font-family:"Segoe UI",Tahoma,"Noto Naskh Arabic","Noto Sans Arabic","Traditional Arabic",Arial,sans-serif}
.wrap{max-width:960px;margin:0 auto;padding:24px 20px 60px}
header.report-head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding:20px 24px;background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:18px}
.brand-logo{max-height:44px;max-width:180px;object-fit:contain}
.client-title{font-size:1.05rem;font-weight:600}
.meta{color:var(--muted);font-size:.8rem;line-height:1.5}
h1{font-size:1.6rem;margin:.1rem 0 .3rem}
h2.sec{font-size:1.15rem;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid var(--brand)}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 20px;margin-bottom:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.kpi{border:1px solid var(--line);border-radius:8px;padding:12px 14px;background:var(--bg)}
.kpi .k{font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.kpi .v{font-size:1.35rem;font-weight:700;margin-top:4px}
.kpi .d{font-size:.8rem;margin-top:2px}
.improved{color:var(--ok)}.declined{color:var(--bad)}.flat{color:var(--muted)}
table{width:100%;border-collapse:collapse;margin-top:6px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}
th{font-size:.74rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
td{font-size:.88rem}
ul{margin:6px 0 0;padding-left:18px}
li{margin:4px 0}
.tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:.72rem;font-weight:600;background:var(--bg);border:1px solid var(--line)}
.tag-ok{color:var(--ok);border-color:currentColor}
.tag-warn{color:var(--warn);border-color:currentColor}
.tag-bad{color:var(--bad);border-color:currentColor}
.notice{font-size:.82rem;color:var(--muted);background:var(--bg);border-left:3px solid var(--brand);padding:8px 12px;border-radius:4px}
.disc{font-size:.76rem;color:var(--muted);background:#fff7e6;border:1px solid #f3d9a4;border-radius:8px;padding:10px 14px;margin:16px 0}
.empty{color:var(--muted);font-style:italic;padding:8px 0}
footer.report-foot{color:var(--muted);font-size:.78rem;text-align:center;padding-top:24px;border-top:1px solid var(--line);margin-top:12px}
.columns{columns:2;column-gap:24px}@media(max-width:640px){.columns{columns:1}}
/* --- Right-to-left overrides (Arabic) --- */
:root[dir="rtl"] th,:root[dir="rtl"] td{text-align:right}
:root[dir="rtl"] ul{padding-left:0;padding-right:18px}
:root[dir="rtl"] .notice{border-left:none;border-right:3px solid var(--brand)}
:root[dir="rtl"] .kpi .k,:root[dir="rtl"] th{letter-spacing:0;text-transform:none}
/* Numbers and URLs stay LTR-isolated so digits are never mirrored or clipped. */
.num{direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums}
:root[dir="rtl"] .num{text-align:left}
@media print{body{background:#fff}.card,header.report-head{break-inside:avoid;border-color:#d7dee6}.disc{background:#fff7e6}}
</style>
</head>
<body>
<div class="wrap">
<header class="report-head">
  <div>
    ${logo(branding.agencyLogoUrl, branding.agencyName)}
    <div class="client-title">${escapeHtml(branding.clientName)}</div>
    <div class="meta">${escapeHtml(title)}</div>
  </div>
  <div class="meta">
    ${escapeHtml(branding.agencyName)}<br />
    ${contact ? `${contact}<br />` : ''}
    Period: ${escapeHtml(data.period.label)}
  </div>
</header>
${body}
<footer class="report-foot">${footer ? `${footer}<br />` : ''}Generated ${escapeHtml(data.generatedAt)} &middot; ${escapeHtml(branding.agencyName)} &middot; ${escapeHtml(branding.clientName)}</footer>
</div>
</body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
