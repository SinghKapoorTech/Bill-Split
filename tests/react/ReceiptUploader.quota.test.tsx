/**
 * The scan gate lives INSIDE `ReceiptUploader`, and these tests are the reason.
 *
 * The uploader is rendered from three places — `BillEntryStep` twice (the AI
 * tab and the desktop card) and `StepHeader:57`. (`AssignmentStep` imports it
 * but never renders it; that import is dead.) Gating at the call sites would
 * mean three copies of the same condition, and the third is the one that would
 * rot: `StepHeader` renders the FULL uploader, camera button and all, whenever
 * a bill has a `receiptImageUrl` but no local `imagePreview`. One seam here
 * covers every entry.
 *
 * THE DESIGN THESE TESTS PIN (owner's call, replacing an inline wall):
 *   - the count is STANDING TEXT, present in every band including zero;
 *   - the controls stay on screen at zero and a TAP raises a modal, rather than
 *     the control silently disappearing;
 *   - every route that would spend a scan raises it — the picker, the demo
 *     shortcut, a drop, and the Analyze button that actually burns the quota.
 *
 * MOCKING NOTE — `useScanDisclosure` is mocked with a plain factory and NO
 * `importOriginal`. The real module reaches `@/config/firebase`, which calls
 * `getAuth(app)` at import time and throws `auth/invalid-api-key` without a
 * populated `.env`. That put a red gate on `main` once already.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import type { DisclosureLevel } from '@/utils/quotaDisclosure';

const h = vi.hoisted(() => ({
  disclosure: {
    level: 'hidden' as DisclosureLevel,
    text: '',
    used: 0,
    remaining: 2,
    limit: 2,
    resetsAtMs: Date.UTC(2026, 9, 1),
    unlimited: false,
    loading: false,
  },
  pickImage: vi.fn(),
  isNative: false,
}));

vi.mock('@/hooks/useScanDisclosure', () => ({ useScanDisclosure: () => h.disclosure }));
vi.mock('@/hooks/usePlatform', () => ({
  usePlatform: () => ({
    platform: h.isNative ? 'ios' : 'web',
    isNative: h.isNative,
    isWeb: !h.isNative,
    isIOS: h.isNative,
    isAndroid: false,
  }),
}));
vi.mock('@/hooks/useImagePicker', () => ({ useImagePicker: () => ({ pickImage: h.pickImage }) }));

import { ReceiptUploader } from '@/components/receipt/ReceiptUploader';

const noop = () => {};
const STAGED = {
  imagePreview: 'data:image/png;base64,AAAA',
  selectedFile: new File(['x'], 'receipt.png', { type: 'image/png' }),
};

function renderUploader(overrides: Partial<React.ComponentProps<typeof ReceiptUploader>> = {}) {
  return render(
    <ReceiptUploader
      selectedFile={null}
      imagePreview={null}
      isDragging={false}
      isUploading={false}
      isAnalyzing={false}
      onFileInput={noop}
      onDragOver={noop}
      onDragLeave={noop}
      onDrop={noop}
      onRemove={noop}
      onAnalyze={noop}
      fileInputRef={createRef<HTMLInputElement>()}
      {...overrides}
    />,
  );
}

const AT_ZERO = {
  level: 'wall' as DisclosureLevel,
  text: '0 free AI scans left this month · resets Oct 1',
  used: 2,
  remaining: 0,
};

const modal = () => screen.queryByText('You have 0 free AI scans left this month.');

beforeEach(() => {
  vi.clearAllMocks();
  h.isNative = false;
  h.disclosure = {
    level: 'hidden',
    text: '',
    used: 0,
    remaining: 2,
    limit: 2,
    resetsAtMs: Date.UTC(2026, 9, 1),
    unlimited: false,
    loading: false,
  };
});

describe('ReceiptUploader — the standing count', () => {
  it('states how many scans are left above the CTA', () => {
    h.disclosure = { ...h.disclosure, level: 'ambient', text: '2 free AI scans left this month' };
    renderUploader();
    expect(screen.getByText('2 free AI scans left this month')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Choose Photo/ })).toBeInTheDocument();
  });

  it('keeps stating it at zero, where the modal has not fired yet', () => {
    // The modal is tap-triggered, so this line is the ONLY explanation on
    // screen until the user reaches for a scan. If it vanished at zero the tab
    // would silently look normal.
    h.disclosure = { ...h.disclosure, ...AT_ZERO };
    renderUploader();
    expect(
      screen.getByText('0 free AI scans left this month · resets Oct 1'),
    ).toBeInTheDocument();
  });

  it('states it in the preview state too', () => {
    h.disclosure = { ...h.disclosure, level: 'last', text: '1 free AI scan left this month' };
    renderUploader(STAGED);
    expect(screen.getByText('1 free AI scan left this month')).toBeInTheDocument();
  });

  it('shows nothing at hidden — Pro, the kill switch, and mid-load', () => {
    renderUploader();
    expect(screen.queryByText(/free AI scan/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Choose Photo/ })).toBeInTheDocument();
  });
});

describe('ReceiptUploader — at zero, every scan route raises the modal', () => {
  beforeEach(() => {
    h.disclosure = { ...h.disclosure, ...AT_ZERO };
  });

  it('does not open the modal before the user asks for anything', () => {
    renderUploader();
    expect(modal()).not.toBeInTheDocument();
  });

  it('raises it from the photo CTA on web', async () => {
    renderUploader();
    await userEvent.click(screen.getByRole('button', { name: /Choose Photo/ }));
    expect(modal()).toBeInTheDocument();
  });

  it('raises it on NATIVE, where the tap would open the real camera', async () => {
    // The web assertion `expect(pickImage).not.toHaveBeenCalled()` could not
    // fail: with isNative false, `handleSelectImage` never reaches `pickImage`
    // whether or not the gate exists. Only the native branch actually proves
    // the camera stays shut — and native is the build that ships.
    h.isNative = true;
    renderUploader({ onImageSelected: vi.fn() });
    await userEvent.click(screen.getByRole('button', { name: /Take Photo/ }));
    expect(modal()).toBeInTheDocument();
    expect(h.pickImage).not.toHaveBeenCalled();
  });

  it('opens the camera normally on native below the wall', async () => {
    // The other half of the pair: proves the native assertion above can fail.
    h.isNative = true;
    h.disclosure = { ...h.disclosure, level: 'ambient', text: '2 free AI scans left this month' };
    renderUploader({ onImageSelected: vi.fn() });
    await userEvent.click(screen.getByRole('button', { name: /Take Photo/ }));
    expect(h.pickImage).toHaveBeenCalledTimes(1);
  });

  it('raises it from the demo-image shortcut, which bypasses the picker', async () => {
    const onImageSelected = vi.fn();
    renderUploader({ onImageSelected });
    await userEvent.click(screen.getByRole('button', { name: /Use Demo Image/ }));
    expect(modal()).toBeInTheDocument();
    expect(onImageSelected).not.toHaveBeenCalled();
  });

  it('raises it from a drop, without staging a billable upload', () => {
    // Call sites hand a dropped file straight to `onImageSelected`, which kicks
    // off a background `uploadReceiptImage` — a Cloud Storage write for a user
    // who cannot analyze the result.
    const onDrop = vi.fn();
    const { container } = renderUploader({ onDrop });
    fireEvent.drop(container.querySelector('.border-dashed') as Element);
    expect(modal()).toBeInTheDocument();
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('raises it from Analyze — THE control that actually spends the scan', async () => {
    // An image reaches this state without touching the CTA: a bill that already
    // carries a `receiptImageUrl`, or a drop from before the quota ran out.
    const onAnalyze = vi.fn();
    renderUploader({ ...STAGED, onAnalyze });
    await userEvent.click(screen.getByRole('button', { name: /Analyze Receipt/ }));
    expect(modal()).toBeInTheDocument();
    expect(onAnalyze).not.toHaveBeenCalled();
  });
});

describe('ReceiptUploader — below zero nothing is blocked', () => {
  beforeEach(() => {
    h.disclosure = { ...h.disclosure, level: 'ambient', text: '2 free AI scans left this month' };
  });

  it('lets Analyze through', async () => {
    const onAnalyze = vi.fn();
    renderUploader({ ...STAGED, onAnalyze });
    await userEvent.click(screen.getByRole('button', { name: /Analyze Receipt/ }));
    expect(onAnalyze).toHaveBeenCalledTimes(1);
    expect(modal()).not.toBeInTheDocument();
  });

  it('lets a drop through', () => {
    const onDrop = vi.fn();
    const { container } = renderUploader({ onDrop });
    fireEvent.drop(container.querySelector('.border-dashed') as Element);
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  it('lets the demo shortcut through', async () => {
    renderUploader({ onImageSelected: vi.fn() });
    await userEvent.click(screen.getByRole('button', { name: /Use Demo Image/ }));
    expect(modal()).not.toBeInTheDocument();
  });
});

describe('ReceiptUploader — what the modal offers', () => {
  beforeEach(() => {
    h.disclosure = { ...h.disclosure, ...AT_ZERO };
  });

  it('routes the user to Pro', async () => {
    const onSeePro = vi.fn();
    renderUploader({ onSeePro });
    await userEvent.click(screen.getByRole('button', { name: /Choose Photo/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Get Pro in the app' }));
    expect(onSeePro).toHaveBeenCalledTimes(1);
  });

  it('offers the manual escape hatch when the call site has one', async () => {
    const onAddManually = vi.fn();
    renderUploader({ onAddManually });
    await userEvent.click(screen.getByRole('button', { name: /Choose Photo/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add items manually' }));
    expect(onAddManually).toHaveBeenCalledTimes(1);
  });

  it('omits the manual button where the call site has nowhere to send them', async () => {
    // Desktop keeps the items table on screen in the right column, so there is
    // nothing to switch to and the button would be a no-op.
    renderUploader();
    await userEvent.click(screen.getByRole('button', { name: /Choose Photo/ }));
    expect(screen.queryByRole('button', { name: 'Add items manually' })).not.toBeInTheDocument();
  });
});


describe('ReceiptUploader — a blocked drop leaves no stuck state', () => {
  beforeEach(() => {
    h.disclosure = { ...h.disclosure, ...AT_ZERO };
  });

  it('clears the drag highlight it refused to act on', () => {
    // `setIsDragging(false)` lives inside the call sites' `handleDrop`, which
    // the quota gate short-circuits — and `dragleave` does NOT fire after a
    // `drop`. Without an explicit clear the card stays border-primary /
    // bg-primary/10 / scale-[1.02] FOREVER, until the user happens to drag
    // something over it and back out again.
    const onDragLeave = vi.fn();
    const onDrop = vi.fn();
    const { container } = renderUploader({ onDragLeave, onDrop });

    fireEvent.drop(container.querySelector('.border-dashed') as Element);

    expect(onDrop).not.toHaveBeenCalled();
    expect(onDragLeave).toHaveBeenCalledTimes(1);
  });
});

describe('ReceiptUploader — the modal empties itself if the gate lifts', () => {
  it('stops selling Pro to someone whose entitlement just arrived', () => {
    // The dialog's `open` is driven by local state, so a snapshot that resolves
    // to Pro (or a kill-switch flip) WHILE the modal is up would otherwise
    // leave a paying subscriber reading "Upgrade to Pro". Passing the live
    // level through lets the component's own self-gating empty it.
    h.disclosure = { ...h.disclosure, ...AT_ZERO };
    const { rerender } = renderUploader();
    fireEvent.click(screen.getByRole('button', { name: /Choose Photo/ }));
    expect(modal()).toBeInTheDocument();

    h.disclosure = { ...h.disclosure, level: 'hidden', text: '', unlimited: true };
    rerender(
      <ReceiptUploader
        selectedFile={null}
        imagePreview={null}
        isDragging={false}
        isUploading={false}
        isAnalyzing={false}
        onFileInput={noop}
        onDragOver={noop}
        onDragLeave={noop}
        onDrop={noop}
        onRemove={noop}
        onAnalyze={noop}
        fileInputRef={createRef<HTMLInputElement>()}
      />,
    );

    expect(modal()).not.toBeInTheDocument();
  });
});
