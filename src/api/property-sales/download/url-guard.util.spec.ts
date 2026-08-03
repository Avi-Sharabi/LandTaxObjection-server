import { assertAllowedDownloadUrl } from './url-guard.util';

const ALLOWED = ['valuation.property.nsw.gov.au', 'www.valuergeneral.nsw.gov.au'];

describe('assertAllowedDownloadUrl', () => {
  it('accepts an https URL whose host is on the allowlist', () => {
    const url = 'https://valuation.property.nsw.gov.au/__psi/weekly/20260727.zip';
    expect(assertAllowedDownloadUrl(url, ALLOWED).href).toBe(url);
  });

  it('rejects an http (non-https) URL', () => {
    expect(() =>
      assertAllowedDownloadUrl('http://valuation.property.nsw.gov.au/file.zip', ALLOWED),
    ).toThrow(/https/);
  });

  it('rejects a host not on the allowlist (SSRF guard)', () => {
    expect(() => assertAllowedDownloadUrl('https://evil.example.com/file.zip', ALLOWED)).toThrow(
      /not on the configured allowlist/,
    );
  });

  it('rejects an attempt to target a private/internal address', () => {
    expect(() => assertAllowedDownloadUrl('https://169.254.169.254/latest/meta-data', ALLOWED)).toThrow(
      /not on the configured allowlist/,
    );
    expect(() => assertAllowedDownloadUrl('https://localhost:5432/', ALLOWED)).toThrow(
      /not on the configured allowlist/,
    );
  });

  it('rejects an unparseable URL', () => {
    expect(() => assertAllowedDownloadUrl('not a url', ALLOWED)).toThrow();
  });

  it('matches the host case-insensitively', () => {
    const url = 'https://VALUATION.PROPERTY.NSW.GOV.AU/file.zip';
    expect(() => assertAllowedDownloadUrl(url, ALLOWED)).not.toThrow();
  });
});
