/**
 * classifyBillLoadError / billLoadErrorVariant decide which failure screen a
 * user sees when a bill URL fails to load. Mixing up "denied" and "offline"
 * tells a user with no access to keep retrying, or tells an offline user the
 * bill is gone — so each mapping is pinned with an independent literal.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { classifyBillLoadError, billLoadErrorVariant } from '@/utils/billLoadResult';

// FirestoreError-shaped values (the real class needs the SDK; the classifier
// only reads `.code`).
const firestoreError = (code: string) => Object.assign(new Error(code), { name: 'FirebaseError', code });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('classifyBillLoadError', () => {
  it('maps permission-denied to denied', () => {
    expect(classifyBillLoadError(firestoreError('permission-denied'))).toBe('denied');
  });

  it('maps unavailable to offline', () => {
    expect(classifyBillLoadError(firestoreError('unavailable'))).toBe('offline');
  });

  it('maps any error to offline while the browser reports offline', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(classifyBillLoadError(new Error('Failed to get document because the client is offline.'))).toBe('offline');
  });

  it('keeps permission-denied as denied even while offline', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(classifyBillLoadError(firestoreError('permission-denied'))).toBe('denied');
  });

  it('maps other errors to error while online', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(classifyBillLoadError(firestoreError('internal'))).toBe('error');
    expect(classifyBillLoadError(new Error('boom'))).toBe('error');
    expect(classifyBillLoadError('a string')).toBe('error');
    expect(classifyBillLoadError(null)).toBe('error');
    expect(classifyBillLoadError(undefined)).toBe('error');
  });

  it('does not throw when navigator is undefined', () => {
    vi.stubGlobal('navigator', undefined);
    expect(classifyBillLoadError(new Error('boom'))).toBe('error');
    expect(classifyBillLoadError(firestoreError('unavailable'))).toBe('offline');
  });
});

describe('billLoadErrorVariant', () => {
  it('shows the unavailable screen for not-found and denied', () => {
    expect(billLoadErrorVariant('not-found')).toBe('unavailable');
    expect(billLoadErrorVariant('denied')).toBe('unavailable');
  });

  it('shows the offline screen for offline and error', () => {
    expect(billLoadErrorVariant('offline')).toBe('offline');
    expect(billLoadErrorVariant('error')).toBe('offline');
  });
});
