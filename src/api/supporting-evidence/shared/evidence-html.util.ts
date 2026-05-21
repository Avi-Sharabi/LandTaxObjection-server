export interface PropMeta {
  address: string;
  propId: string;
  lotPlan: string;
}

export interface IssueEvidence {
  tick: boolean;
  confidence: string;
  trigger: string | null;
  text_box_content: string | null;
}

export interface DataSection {
  label: string;
  data: unknown;
}

function escHtml(val: unknown): string {
  return String(val == null ? '' : val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mdToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const withBold = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return withBold
    .split(/\n\n+/)
    .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function renderValue(val: unknown, compact = false): string {
  if (val == null || val === '') return '<em style="color:#aaa">—</em>';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val !== 'object') return escHtml(String(val));

  if (Array.isArray(val)) {
    if (val.length === 0) return '<em style="color:#aaa">—</em>';
    if (compact) return val.map(v => renderValue(v, true)).join('<br>');
    if (typeof val[0] !== 'object' || val[0] === null) {
      return val.map(v => escHtml(String(v))).join(', ');
    }
    const arr = val as Record<string, unknown>[];
    const headers = [...new Set(arr.flatMap(d => Object.keys(d && typeof d === 'object' ? d : {})))];
    const head = `<thead><tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>`;
    const body = arr.map(d =>
      `<tr>${headers.map(h => `<td>${renderValue(d[h], true)}</td>`).join('')}</tr>`
    ).join('');
    return `<table style="margin:4px 0 8px;">${head}<tbody>${body}</tbody></table>`;
  }

  if (compact) {
    const lines = Object.entries(val as Record<string, unknown>)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `<strong>${escHtml(k)}:</strong> ${escHtml(String(v))}`);
    return lines.length ? lines.join('<br>') : '<em style="color:#aaa">—</em>';
  }

  const obj = val as Record<string, unknown>;
  const rows = Object.entries(obj)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<tr><td style="font-weight:bold;min-width:140px;padding:4px 8px;">${escHtml(k)}</td><td style="padding:4px 8px;">${renderValue(v, true)}</td></tr>`)
    .join('');
  return rows ? `<table style="margin:4px 0 8px;"><tbody>${rows}</tbody></table>` : '<em style="color:#aaa">—</em>';
}

function renderDataBlock(data: unknown): string {
  if (Array.isArray(data) && data.length > 0 && (data[0] as Record<string, unknown>)?.seppName != null) {
    const rows = (data as Array<{ seppName?: unknown; mapName?: string[]; seppLink?: string }>)
      .map(s => {
        const maps = (s.mapName || []).map(m => `<li>${escHtml(m)}</li>`).join('');
        const link = s.seppLink
          ? `<a href="${escHtml(s.seppLink)}" style="color:#003087;font-size:9pt;">${escHtml(s.seppLink)}</a>`
          : '—';
        return `<tr><td>${escHtml(s.seppName)}</td><td><ul style="margin:2px 0;padding-left:16px;">${maps}</ul></td><td>${link}</td></tr>`;
      })
      .join('');
    return `<p style="color:#444;font-size:10pt;margin-bottom:10px;">The following State Environmental Planning Policies (SEPPs) apply to this property, confirmed via the NSW ePlanning API.</p>
<table><thead><tr><th>SEPP Name</th><th>Applicable Map(s)</th><th>Legislation</th></tr></thead><tbody>${rows}</tbody></table>`;

  } else if (Array.isArray(data) && data.length > 0) {
    const arr = data as Record<string, unknown>[];
    const headers = [...new Set(arr.flatMap(d => Object.keys(d && typeof d === 'object' ? d : {})))];
    const head = `<thead><tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>`;
    const body = arr.map(d =>
      `<tr>${headers.map(h => `<td>${renderValue(d[h])}</td>`).join('')}</tr>`
    ).join('');
    return `<table>${head}<tbody>${body}</tbody></table>`;

  } else if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    const rows = Object.entries(obj)
      .map(([k, v]) => `<tr><td style="font-weight:bold;min-width:200px;">${escHtml(k)}</td><td>${renderValue(v)}</td></tr>`)
      .join('');
    return `<table><tbody>${rows}</tbody></table>`;
  }

  return '';
}

export function generateEvidenceHtml(
  label: string,
  data: unknown,
  meta: PropMeta,
  issueEvidence?: IssueEvidence,
  sections?: DataSection[],
): string {
  const timestamp = new Date().toISOString();
  const dateStr = timestamp.split('T')[0];
  const { address, propId, lotPlan } = meta;

  let findingHtml = '';
  if (issueEvidence) {
    const tickClass = issueEvidence.tick ? 'finding-yes' : 'finding-no';
    const badgeText = issueEvidence.tick ? '&#10003; ISSUE IDENTIFIED' : '&#10007; NOT TRIGGERED';
    const triggerHtml = issueEvidence.trigger
      ? `<div class="trigger">${escHtml(issueEvidence.trigger)}</div>`
      : '';
    findingHtml = `<div class="finding-box ${tickClass}">
  <span class="badge">${badgeText}</span><span class="confidence-chip">${escHtml(issueEvidence.confidence)}</span>${triggerHtml}
</div>`;
    if (issueEvidence.text_box_content) {
      findingHtml += `<div class="argument-section">
  <h2 class="argument-heading">Objection Argument</h2>
  <div class="argument-body">${mdToHtml(issueEvidence.text_box_content)}</div>
</div>`;
    }
  }

  let contentHtml = '';
  if (sections) {
    contentHtml = sections
      .filter(s => s.data != null && (!Array.isArray(s.data) || (s.data as unknown[]).length > 0))
      .map(s => `<h3 class="section-heading">${escHtml(s.label)}</h3>${renderDataBlock(s.data)}`)
      .join('');
  } else {
    contentHtml = renderDataBlock(data);
  }

  const dataHeading = issueEvidence && contentHtml ? `<h2 class="data-heading">Supporting Data</h2>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>NSW Planning Evidence — ${escHtml(label)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#222;max-width:850px;margin:40px auto;padding:0 24px;line-height:1.5}
.gov-header{border-bottom:4px solid #003087;padding-bottom:12px;margin-bottom:20px}
.gov-header h1{font-size:14pt;color:#003087;margin:0 0 4px}
.gov-header .sub{font-size:9.5pt;color:#555}
.prop-box{background:#f0f4fa;border:1px solid #b0c4df;padding:12px 18px;border-radius:4px;margin-bottom:22px}
.prop-box h2{font-size:12.5pt;margin:0 0 5px;color:#003087}
.prop-box p{margin:2px 0;font-size:9.5pt;color:#444}
table{width:100%;border-collapse:collapse;margin:8px 0 18px;font-size:10pt}
thead tr th{background:#003087;color:#fff;padding:8px 12px;text-align:left;font-weight:normal}
tbody tr td{padding:7px 12px;border-bottom:1px solid #dde;vertical-align:top}
tbody tr:nth-child(even) td{background:#f7f9fc}
ul{margin:2px 0;padding-left:16px} li{margin:2px 0}
.footer{font-size:9pt;color:#666;border-top:1px solid #ddd;padding-top:8px;margin-top:24px}
.disclaimer{font-size:8.5pt;color:#888;margin-top:6px}
.finding-box{border-left:5px solid #003087;padding:12px 16px;margin-bottom:18px;background:#f0f4fa;border-radius:0 4px 4px 0}
.finding-yes{border-left-color:#0a7340}
.finding-no{border-left-color:#888}
.badge{display:inline-block;font-weight:bold;font-size:10pt;margin-right:10px}
.confidence-chip{font-size:9pt;color:#555;border:1px solid #ccc;border-radius:10px;padding:1px 8px;margin-right:8px}
.trigger{font-size:9.5pt;color:#333;margin-top:6px;font-style:italic}
.argument-section{background:#fffdf0;border:1px solid #e8d080;border-radius:4px;padding:16px 20px;margin-bottom:22px}
.argument-heading{font-size:12pt;color:#003087;margin:0 0 10px;border-bottom:1px solid #e8d080;padding-bottom:6px}
.argument-body{font-size:10.5pt;line-height:1.7;color:#222}
.argument-body p{margin:0 0 10px}
.data-heading{font-size:11pt;color:#003087;border-bottom:2px solid #003087;padding-bottom:4px;margin:18px 0 10px}
.section-heading{font-size:10.5pt;color:#444;margin:16px 0 6px;font-weight:bold}
@media print{body{margin:20px;padding:0}.gov-header{border-bottom-width:2px}}
</style>
</head>
<body>
<div class="gov-header">
  <h1>NSW Planning Evidence Extract</h1>
  <div class="sub">${escHtml(label)} &nbsp;·&nbsp; NSW Planning Portal · ePlanning API · Retrieved ${escHtml(dateStr)}</div>
</div>
<div class="prop-box">
  <h2>${escHtml(address || 'Property')}</h2>
  <p>Property ID: <strong>${escHtml(propId || '—')}</strong> &nbsp;|&nbsp; Lot/Plan: <strong>${escHtml(lotPlan || '—')}</strong></p>
  <p>Date retrieved: <strong>${escHtml(dateStr)}</strong></p>
</div>
${findingHtml}
${dataHeading}
${contentHtml}
<div class="footer">
  <strong>Data source:</strong> NSW ePlanning API (api.apps1.nsw.gov.au) &amp; NSW ArcGIS REST Services<br>
  <strong>Retrieved:</strong> ${escHtml(timestamp)}&nbsp; <strong>Purpose:</strong> Supporting evidence for Valuer General objection to land value assessment
  <div class="disclaimer">This document was generated from the NSW Government ePlanning API and ArcGIS REST services. The data reflects official NSW Planning Portal records as at the date of retrieval and may be submitted as supporting evidence in Valuer General objection proceedings.</div>
</div>
</body>
</html>`;
}
