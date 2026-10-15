/**
 * Money bug class: a new bill kept the previous bill's data, because a
 * `<prefix>/:billId` route reuses one page instance and the wizards seed
 * their state only at mount. useBillRouteInstanceKey gives each bill a fresh
 * instance. The stub below seeds from the route at mount and never again,
 * exactly like the wizards — so a missing remount shows the OLD bill.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { useBillRouteInstanceKey } from '@/hooks/useBillRouteInstanceKey';

let mounts = 0;
function MountSeeded() {
  const { billId } = useParams();
  const [seeded] = useState(() => {
    mounts += 1;
    return billId;
  });
  return <div data-testid="seeded">{seeded}</div>;
}
function Page() {
  return <MountSeeded key={useBillRouteInstanceKey()} />;
}

let nav: ReturnType<typeof useNavigate>;
function NavGrabber() {
  nav = useNavigate();
  return null;
}

function renderAt(p: string) {
  mounts = 0;
  render(
    <MemoryRouter initialEntries={[p]}>
      <NavGrabber />
      <Routes>
        <Route path="/x/:billId" element={<Page />} />
      </Routes>
    </MemoryRouter>,
  );
}
const seeded = () => screen.getByTestId('seeded').textContent;

describe('useBillRouteInstanceKey', () => {
  it('existing bill -> new: fresh instance', async () => {
    renderAt('/x/bill-a');
    await act(async () => nav('/x/new'));
    expect(seeded()).toBe('new');
  });

  it('bill A -> bill B: fresh instance', async () => {
    renderAt('/x/bill-a');
    await act(async () => nav('/x/bill-b'));
    expect(seeded()).toBe('bill-b');
  });

  it('new -> new (draft saved via history.replaceState): fresh instance', async () => {
    // SimpleTransactionWizard saves its draft with window.history.replaceState,
    // so the router still says /x/new when the user starts another one.
    renderAt('/x/new');
    expect(mounts).toBe(1);
    await act(async () => nav('/x/new'));
    expect(mounts).toBe(2);
  });

  it('draft JIT-created (new -> id with DRAFT_CREATED_NAV_STATE): same instance', async () => {
    renderAt('/x/new');
    await act(async () => nav('/x/bill-jit', { replace: true, state: { draftCreated: true } }));
    expect(mounts).toBe(1);
    expect(seeded()).toBe('new');
  });

  it('a replace WITHOUT the flag (goBack) still remounts', async () => {
    renderAt('/x/new');
    await act(async () => nav('/x/bill-a', { replace: true }));
    expect(seeded()).toBe('bill-a');
  });

  it('new, same-URL REPLACE (clearing nav state): same instance', async () => {
    renderAt('/x/new');
    // Explicit path: NavGrabber sits outside <Routes>, so '.' would resolve to '/'.
    await act(async () => nav('/x/new', { replace: true, state: {} }));
    expect(screen.getByTestId('seeded')).toBeInTheDocument();
    expect(mounts).toBe(1);
  });

  it('same bill, state-only navigation: same instance', async () => {
    renderAt('/x/bill-a');
    await act(async () => nav('/x/bill-a', { replace: true, state: {} }));
    expect(screen.getByTestId('seeded')).toBeInTheDocument();
    expect(mounts).toBe(1);
  });
});

describe('every bill page is keyed by useBillRouteInstanceKey', () => {
  it.each([
    ['src/pages/AIScanView.tsx', 'AIScanViewContent'],
    ['src/pages/AirbnbView.tsx', 'AirbnbViewContent'],
    ['src/pages/SimpleTransactionView.tsx', 'SimpleTransactionViewContent'],
  ])('%s', (file, inner) => {
    const src = readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8');
    const def = src.indexOf('export default function');
    expect(def).toBeGreaterThan(-1);
    const end = src.indexOf('\n}', def);
    expect(end).toBeGreaterThan(def); // marker found — slice is not the whole file
    const body = src.slice(def, end);
    expect(body).toContain(`<${inner} key={useBillRouteInstanceKey()} />`);
  });
});
