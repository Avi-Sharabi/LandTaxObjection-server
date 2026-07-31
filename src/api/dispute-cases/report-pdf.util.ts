import { Browser } from 'puppeteer';

/**
 * The two safety/format invariants shared by every client-facing PDF report this module produces
 * (currently the valuation report and the Evidence Score Report).
 *
 * Shared rather than copy-pasted because both are things that must be IDENTICAL between the reports:
 * a placeholder guard that is weaker in one of two copies is exactly how an unresolved token reaches
 * a client, and page geometry that drifts between the CSS @page rule and the Puppeteer call produces
 * a report whose margins silently disagree with its own stylesheet.
 */

/**
 * Defence in depth against both unresolved Nunjucks variables (a template bug) and LLM-output
 * artifacts — e.g. a case's ground `analysis` text carrying an embedded instruction that talks the
 * model into echoing placeholder tokens. A report containing any of these must never reach a client.
 *
 * Note the corollary for any report that renders DB-sourced free text: those fields are known to
 * contain unfilled placeholders (src/skills/evidence-score.md scores exactly that as a weakness), so
 * a report which copies them verbatim must neutralise these patterns BEFORE rendering, or one stale
 * "[address]" in a stored analysis makes that case's report un-generatable in perpetuity.
 */
export const LEFTOVER_ARTIFACT_PATTERN =
  /\[[A-Z_]+\]|\{\{.*?\}\}|\bTODO\b|\bTBD\b|\bXXX\b|lorem ipsum/i;

/**
 * Returns the first leftover artifact in the rendered HTML, or null when it is clean.
 *
 * Returns rather than throws so each caller keeps its own exception type and its own log context —
 * a shared throw would force one exception class across both reports and make a failed generation
 * harder to triage back to the report that produced it.
 */
export function findLeftoverArtifact(html: string): string | null {
  return html.match(LEFTOVER_ARTIFACT_PATTERN)?.[0] ?? null;
}

/**
 * Neutralises the artifact guard's OWN patterns in a string copied verbatim out of the database.
 *
 * Apply to every DB-sourced free-text value that reaches a template: objection-ground analysis and
 * concession notes, supporting-evidence narratives and documents-to-attach lists, comparable-sale
 * warnings, and the stored evidence-score rationale explanations and recommendation actions.
 *
 * Necessary because those fields are client-supplied or AI-extracted and are KNOWN to contain
 * unfilled placeholders. Without this, findLeftoverArtifact() would reject the report for a defect in
 * the input data rather than in the output — and the failure would surface as an opaque exception in a
 * background worker rather than as the "this narrative is incomplete" finding it actually is.
 *
 * The replacements are deliberately readable: the reader of the PDF should be able to tell that the
 * source text was incomplete, which is itself an evidentiary finding.
 */
export function sanitiseForArtifactGuard(text: string): string {
  return text
    .replace(/\{\{[^}]*\}\}/g, '(unresolved field)')
    .replace(/\[[A-Z_]+\]/g, '(unfilled field)')
    .replace(/\b(TODO|TBD|XXX)\b/gi, '(incomplete)');
}

/**
 * Page geometry for the report PDFs.
 *
 * MUST stay in step with the `@page { size: Letter; margin: 25mm 19mm 22mm 19mm }` rule in each
 * report template's stylesheet — Puppeteer's own options win, so a divergence means the CSS is
 * describing a page that is not being produced.
 */
export const REPORT_PDF_OPTIONS = {
  format: 'Letter',
  printBackground: true,
  margin: { top: '25mm', right: '19mm', bottom: '22mm', left: '19mm' },
} as const;

/**
 * Renders self-contained HTML to a PDF buffer and always closes the browser.
 *
 * Takes an already-launched browser (from PuppeteerService.launchForPdf(), which drops
 * --single-process because that crashes the renderer on large PDF payloads) and owns its lifecycle
 * from there: the finally-close is the part that must not be re-implemented per caller, since a
 * leaked Chrome process on a failed report is invisible until the container runs out of memory.
 */
export async function renderHtmlToReportPdf(html: string, browser: Browser): Promise<Buffer> {
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    const pdf = await page.pdf({ ...REPORT_PDF_OPTIONS, margin: { ...REPORT_PDF_OPTIONS.margin } });
    await page.close().catch(() => {});
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}
