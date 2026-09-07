/**
 * Deep-link URL → in-app route.
 *
 * The two link forms Divit registers parse DIFFERENTLY, and that difference is
 * the whole reason this file exists:
 *
 *   divit://join/abc123?code=XY3K9P
 *     -> protocol "divit:"  host "join"             pathname "/abc123"
 *
 *   https://www.divit-bill.com/join/abc123?code=XY3K9P
 *     -> protocol "https:"  host "www.divit-bill.com"  pathname "/join/abc123"
 *
 * For a non-special scheme the FIRST path segment is parsed as the authority,
 * so `pathname` alone silently drops it: `divit://join/abc123` yields
 * "/abc123", which matches no route and lands on NotFound. Every native share
 * link opened to a 404 because of this — the https form parses correctly, so it
 * never reproduced on web.
 *
 * A custom-scheme link must therefore re-attach the host as the leading path
 * segment; an https link must not.
 */
export function deepLinkToRoute(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';

  // `divit:///join/abc` (empty authority) already carries the full path, so an
  // empty host is treated like the https case rather than producing "//join".
  const path =
    isHttp || !parsed.host ? parsed.pathname : `/${parsed.host}${parsed.pathname}`;

  const route = `${path}${parsed.search}`;

  // Guard against a protocol-relative value reaching the router as "//host",
  // which react-router would treat as an external origin.
  if (route.startsWith('//')) return null;

  return route.startsWith('/') ? route : `/${route}`;
}
