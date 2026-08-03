/**
 * Inlined stand-ins for real discovery-page HTML, used by
 * link-extractor.util.spec.ts and source-discovery.service.spec.ts.
 *
 * These are TypeScript template strings, not `.html` files, because
 * nest-cli.json's `compilerOptions.assets` includes `"**\/*.html"` — a real
 * `.html` fixture would be copied into `dist/` on every build.
 *
 * Ported from nsw-property-sales-poc/tests/fixtures/html/*.html (KAN-241).
 */

/**
 * Hand-written stand-in for the NSW bulk PSI listing. Reproduces the real
 * page's link shapes without copying its markup:
 *
 * - weekly archives at /__psi/weekly/YYYYMMDD.zip with "DD Mmm YYYY" labels
 * - yearly archives at /__psi/yearly/YYYY.zip, which must never be selected
 * - one relative href, to exercise base resolution
 * - one javascript: href, to exercise the unparseable-href skip
 * - a label wrapped in a nested element and one using &nbsp;
 * - rows deliberately NOT in date order, so DOM-position selection fails
 */
export const BULK_PSI_WEEKLY_HTML = `
<h2>Weekly sales data</h2>
<ul>
  <li><a href="https://example.gov.au/__psi/weekly/20260713.zip">13 Jul 2026</a></li>
  <li><a href="https://example.gov.au/__psi/weekly/20260727.zip"><span>27 Jul 2026</span></a></li>
  <li><a href="/__psi/weekly/20260720.zip">20&nbsp;Jul&nbsp;2026</a></li>
  <li><a href="javascript:void(0)">Help</a></li>
</ul>

<h2>Yearly sales data</h2>
<ul>
  <li><a href="https://example.gov.au/__psi/yearly/1990.zip">1990</a></li>
  <li><a href="https://example.gov.au/__psi/yearly/2025.zip">2025</a></li>
</ul>

<p><a href="/about">About this data</a></p>
`;

/** Mirrors the real portal entry page: no direct hrefs, a JS launch() call. */
export const PORTAL_ENTRY_NO_LINKS_HTML = `
<!doctype html>
<html>
  <body>
    <h1>Property sales information</h1>
    <p>This service allows you to download all the sales for various periods in delimited file format.</p>
    <a href="javascript:launch('propertySalesInformation')">Property sales information</a>
  </body>
</html>
`;

/** A page framed inside an iframe — the listing lives in a child frame, not the main document. */
export const BULK_PSI_FRAMED_HTML = `
<!doctype html>
<html>
  <body>
    <iframe src="https://example.gov.au/psi/listing-frame"></iframe>
  </body>
</html>
`;

/** Cloudflare's "Just a moment..." interstitial, served in place of the real listing. */
export const CLOUDFLARE_CHALLENGE_HTML = `
<!doctype html>
<html>
  <head><title>Just a moment...</title></head>
  <body>Checking your browser before accessing the site.</body>
</html>
`;
