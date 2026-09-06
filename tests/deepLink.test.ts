import { describe, it, expect } from 'vitest';
import { deepLinkToRoute } from '@/utils/deepLink';

/**
 * Custom-scheme deep links resolved to NotFound.
 *
 * DeepLinkHandler used to navigate to `url.pathname + url.search`. That is
 * correct for an https universal link and WRONG for `divit://`, where the first
 * segment is parsed as the authority — so `divit://join/abc?code=X` produced
 * "/abc?code=X" and every native share link opened the app on a 404.
 *
 * The first test below fails against that old expression; it is the regression
 * guard, not a restatement of current behaviour.
 */
describe('deepLinkToRoute', () => {
  it('keeps the first segment of a custom-scheme link', () => {
    // Old behaviour produced '/abc123?code=XY3K9P' — the "join" segment lost.
    expect(deepLinkToRoute('divit://join/abc123?code=XY3K9P')).toBe(
      '/join/abc123?code=XY3K9P'
    );
  });

  it('handles a custom-scheme link with no trailing path', () => {
    expect(deepLinkToRoute('divit://dashboard')).toBe('/dashboard');
  });

  it('preserves the query string on a bare custom-scheme host', () => {
    expect(deepLinkToRoute('divit://join?code=XY3K9P')).toBe('/join?code=XY3K9P');
  });

  it('does not double up the path for an https universal link', () => {
    expect(deepLinkToRoute('https://www.divit-bill.com/join/abc123?code=XY3K9P')).toBe(
      '/join/abc123?code=XY3K9P'
    );
  });

  it('treats an empty authority as a plain path', () => {
    expect(deepLinkToRoute('divit:///join/abc123')).toBe('/join/abc123');
  });

  it('returns null for an unparseable URL', () => {
    expect(deepLinkToRoute('not a url')).toBeNull();
  });

  it('routes the two link forms to the same place', () => {
    expect(deepLinkToRoute('divit://join/abc123?code=XY3K9P')).toBe(
      deepLinkToRoute('https://www.divit-bill.com/join/abc123?code=XY3K9P')
    );
  });
});
