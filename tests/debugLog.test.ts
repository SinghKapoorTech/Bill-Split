import { describe, it, expect, vi, afterEach } from 'vitest';
import { createDebugLog } from '@/utils/debugLog';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createDebugLog', () => {
  it('forwards to console.log when enabled', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createDebugLog(true)('[Test]', { uid: 'abc' });
    expect(spy).toHaveBeenCalledWith('[Test]', { uid: 'abc' });
  });

  it('logs NOTHING when disabled', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createDebugLog(false)('[Test]', { uid: 'abc' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not evaluate a thunk argument when disabled', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const expensive = vi.fn(() => 'serialized');
    createDebugLog(false)('[Test]', expensive);
    expect(spy).not.toHaveBeenCalled();
    expect(expensive).not.toHaveBeenCalled();
  });
});
