/**
 * purchaseService — the client half of "who bought this?".
 *
 * The webhook attaches a purchase to `entitlements/{app_user_id}`. If the SDK
 * is configured anonymously, or keeps a previous user's id after an account
 * switch, every purchase arrives unattachable (422 `unresolved-uid`) or lands
 * on the WRONG account. So these tests pin the exact id handed to RevenueCat,
 * not merely that "something was called".
 *
 * Full mock factories only — a partial `importOriginal` mock drags the real
 * modules in (see memory: vitest-importOriginal-firebase-env).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  platform: 'ios' as 'ios' | 'android' | 'web',
  configure: vi.fn(),
  logIn: vi.fn(),
  logOut: vi.fn(),
  setLogLevel: vi.fn(),
  getOfferings: vi.fn(),
  purchasePackage: vi.fn(),
  restorePurchases: vi.fn(),
  checkTrialOrIntroductoryPriceEligibility: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => h.platform !== 'web',
    getPlatform: () => h.platform,
  },
}));

vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: {
    configure: h.configure,
    logIn: h.logIn,
    logOut: h.logOut,
    setLogLevel: h.setLogLevel,
    getOfferings: h.getOfferings,
    purchasePackage: h.purchasePackage,
    restorePurchases: h.restorePurchases,
    checkTrialOrIntroductoryPriceEligibility: h.checkTrialOrIntroductoryPriceEligibility,
  },
  LOG_LEVEL: { DEBUG: 'DEBUG' },
  INTRO_ELIGIBILITY_STATUS: {
    INTRO_ELIGIBILITY_STATUS_UNKNOWN: 0,
    INTRO_ELIGIBILITY_STATUS_INELIGIBLE: 1,
    INTRO_ELIGIBILITY_STATUS_ELIGIBLE: 2,
  },
  PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: '1' },
}));

const ANNUAL_PKG = {
  identifier: '$rc_annual',
  packageType: 'ANNUAL',
  product: {
    identifier: 'divit_pro_annual',
    price: 34.99,
    priceString: '$34.99',
    introPrice: { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 2 },
  },
};
const MONTHLY_PKG = {
  identifier: '$rc_monthly',
  packageType: 'MONTHLY',
  product: { identifier: 'divit_pro_monthly', price: 4.99, priceString: '$4.99', introPrice: null },
};
const OFFERINGS = { current: { availablePackages: [MONTHLY_PKG, ANNUAL_PKG] }, all: {} };
const proInfo = () => ({ entitlements: { active: { pro: { isActive: true } }, all: {} } });
const freeInfo = () => ({ entitlements: { active: {}, all: {} } });

async function load() {
  vi.resetModules();
  return import('@/services/purchaseService');
}

beforeEach(() => {
  h.platform = 'ios';
  h.configure.mockReset().mockResolvedValue(undefined);
  h.logIn.mockReset().mockResolvedValue({ customerInfo: {}, created: false });
  h.logOut.mockReset().mockResolvedValue({ customerInfo: {} });
  h.setLogLevel.mockReset().mockResolvedValue(undefined);
  h.getOfferings.mockReset().mockResolvedValue(OFFERINGS);
  h.purchasePackage
    .mockReset()
    .mockResolvedValue({ customerInfo: proInfo(), productIdentifier: 'divit_pro_annual' });
  h.restorePurchases.mockReset().mockResolvedValue({ customerInfo: proInfo() });
  h.checkTrialOrIntroductoryPriceEligibility.mockReset().mockResolvedValue({
    divit_pro_annual: { status: 2 },
    divit_pro_monthly: { status: 0 },
  });
  vi.stubEnv('VITE_REVENUECAT_IOS_KEY', 'appl_test_ios');
  vi.stubEnv('VITE_REVENUECAT_ANDROID_KEY', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('syncPurchaser — identity handed to RevenueCat', () => {
  it('configures with the Firebase uid as appUserID on first sign-in', async () => {
    const { syncPurchaser } = await load();
    await syncPurchaser('uid-alice');
    expect(h.configure).toHaveBeenCalledTimes(1);
    expect(h.configure).toHaveBeenCalledWith({ apiKey: 'appl_test_ios', appUserID: 'uid-alice' });
    expect(h.logIn).not.toHaveBeenCalled();
  });

  it('switches accounts with logIn(newUid), never a second configure', async () => {
    const { syncPurchaser } = await load();
    await syncPurchaser('uid-alice');
    await syncPurchaser(null);
    await syncPurchaser('uid-bob');
    expect(h.configure).toHaveBeenCalledTimes(1);
    expect(h.logIn).toHaveBeenCalledTimes(1);
    expect(h.logIn).toHaveBeenCalledWith({ appUserID: 'uid-bob' });
  });

  it('logs out on sign-out once configured', async () => {
    const { syncPurchaser } = await load();
    await syncPurchaser('uid-alice');
    await syncPurchaser(null);
    expect(h.logOut).toHaveBeenCalledTimes(1);
  });

  it('does not call logOut when it was never configured (it throws for anonymous users)', async () => {
    const { syncPurchaser } = await load();
    await syncPurchaser(null);
    expect(h.logOut).not.toHaveBeenCalled();
  });

  it('skips a redundant logIn when the same uid re-fires (token refresh)', async () => {
    const { syncPurchaser } = await load();
    await syncPurchaser('uid-alice');
    await syncPurchaser('uid-alice');
    expect(h.configure).toHaveBeenCalledTimes(1);
    expect(h.logIn).not.toHaveBeenCalled();
  });

  it('serialises back-to-back auth events so logIn never races configure', async () => {
    // onAuthStateChanged can fire twice in quick succession. If the second call
    // ran before configure() settled, it would see "not configured" and
    // configure AGAIN with the second uid — or call logIn on an unconfigured SDK.
    let release!: () => void;
    h.configure.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    const { syncPurchaser } = await load();
    const first = syncPurchaser('uid-alice');
    const second = syncPurchaser('uid-bob');
    await Promise.resolve();
    expect(h.logIn).not.toHaveBeenCalled();
    release();
    await Promise.all([first, second]);
    expect(h.configure).toHaveBeenCalledTimes(1);
    expect(h.logIn).toHaveBeenCalledWith({ appUserID: 'uid-bob' });
  });

  it('retries configure on the next event if the first configure failed', async () => {
    h.configure.mockRejectedValueOnce(new Error('boom'));
    const { syncPurchaser } = await load();
    await expect(syncPurchaser('uid-alice')).rejects.toThrow('boom');
    await syncPurchaser('uid-alice');
    expect(h.configure).toHaveBeenCalledTimes(2);
    expect(h.configure).toHaveBeenLastCalledWith({
      apiKey: 'appl_test_ios',
      appUserID: 'uid-alice',
    });
  });
});

describe('syncPurchaser — when RevenueCat must stay off', () => {
  it('is a no-op on the web', async () => {
    h.platform = 'web';
    const { syncPurchaser, isPurchasingAvailable } = await load();
    await syncPurchaser('uid-alice');
    expect(h.configure).not.toHaveBeenCalled();
    expect(isPurchasingAvailable()).toBe(false);
  });

  it('is a no-op when the platform key is missing (Android today)', async () => {
    h.platform = 'android';
    const { syncPurchaser, isPurchasingAvailable } = await load();
    await syncPurchaser('uid-alice');
    expect(h.configure).not.toHaveBeenCalled();
    expect(isPurchasingAvailable()).toBe(false);
  });

  it('reports available on iOS with a key', async () => {
    const { isPurchasingAvailable } = await load();
    expect(isPurchasingAvailable()).toBe(true);
  });
});

describe('loadPaywallPackages', () => {
  it('maps the current offering to paywall inputs, with per-product trial eligibility', async () => {
    const { syncPurchaser, loadPaywallPackages } = await load();
    await syncPurchaser('uid-alice');
    const pkgs = await loadPaywallPackages();
    expect(pkgs).toEqual([
      {
        id: '$rc_monthly',
        packageType: 'MONTHLY',
        price: 4.99,
        priceString: '$4.99',
        intro: null,
        trialEligible: null,
      },
      {
        id: '$rc_annual',
        packageType: 'ANNUAL',
        price: 34.99,
        priceString: '$34.99',
        intro: { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 2 },
        trialEligible: true,
      },
    ]);
  });

  it('marks a product INELIGIBLE when the store says so', async () => {
    h.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({ divit_pro_annual: { status: 1 } });
    const { syncPurchaser, loadPaywallPackages } = await load();
    await syncPurchaser('uid-alice');
    const annual = (await loadPaywallPackages()).find((p) => p.id === '$rc_annual')!;
    expect(annual.trialEligible).toBe(false);
  });

  it('treats an eligibility lookup failure as unknown, not as a load failure', async () => {
    h.checkTrialOrIntroductoryPriceEligibility.mockRejectedValue(new Error('nope'));
    const { syncPurchaser, loadPaywallPackages } = await load();
    await syncPurchaser('uid-alice');
    const pkgs = await loadPaywallPackages();
    expect(pkgs.map((p) => p.trialEligible)).toEqual([null, null]);
  });

  it('throws when there is no current offering, rather than showing an empty paywall', async () => {
    h.getOfferings.mockResolvedValue({ current: null, all: {} });
    const { syncPurchaser, loadPaywallPackages } = await load();
    await syncPurchaser('uid-alice');
    await expect(loadPaywallPackages()).rejects.toThrow();
  });
});

describe('purchasePlan — never buys for an unknown or stale identity', () => {
  it('refuses to purchase before anyone is identified (an anonymous purchase is unattachable)', async () => {
    const { loadPaywallPackages, purchasePlan, syncPurchaser } = await load();
    await syncPurchaser('uid-alice');
    await loadPaywallPackages();
    await syncPurchaser(null);
    await expect(purchasePlan('$rc_annual')).rejects.toThrow(/not signed in/i);
    expect(h.purchasePackage).not.toHaveBeenCalled();
  });

  it('waits for a pending account switch before purchasing', async () => {
    const { loadPaywallPackages, purchasePlan, syncPurchaser } = await load();
    await syncPurchaser('uid-alice');
    await loadPaywallPackages();
    let release!: () => void;
    h.logIn.mockImplementationOnce(() => new Promise((r) => (release = () => r({}))));
    const switching = syncPurchaser('uid-bob');
    const buying = purchasePlan('$rc_annual');
    await Promise.resolve();
    await Promise.resolve();
    expect(h.purchasePackage).not.toHaveBeenCalled();
    release();
    await switching;
    await buying;
    expect(h.logIn.mock.invocationCallOrder[0]).toBeLessThan(h.purchasePackage.mock.invocationCallOrder[0]);
  });

  it('buys the exact package object the store returned', async () => {
    const { loadPaywallPackages, purchasePlan, syncPurchaser } = await load();
    await syncPurchaser('uid-alice');
    await loadPaywallPackages();
    await expect(purchasePlan('$rc_annual')).resolves.toBe('purchased');
    expect(h.purchasePackage).toHaveBeenCalledWith({ aPackage: ANNUAL_PKG });
  });

  it('reports a user cancel as "cancelled", not an error', async () => {
    h.purchasePackage.mockRejectedValue({ code: '1', userCancelled: true, message: 'cancelled' });
    const { loadPaywallPackages, purchasePlan, syncPurchaser } = await load();
    await syncPurchaser('uid-alice');
    await loadPaywallPackages();
    await expect(purchasePlan('$rc_monthly')).resolves.toBe('cancelled');
  });

  it('rethrows a real store failure', async () => {
    h.purchasePackage.mockRejectedValue({ code: '2', userCancelled: false, message: 'store problem' });
    const { loadPaywallPackages, purchasePlan, syncPurchaser } = await load();
    await syncPurchaser('uid-alice');
    await loadPaywallPackages();
    await expect(purchasePlan('$rc_monthly')).rejects.toMatchObject({ code: '2' });
  });

  it('reports "pending" when the store succeeded but Pro is not active yet (Ask to Buy, etc.)', async () => {
    h.purchasePackage.mockResolvedValue({ customerInfo: freeInfo(), productIdentifier: 'divit_pro_annual' });
    const { loadPaywallPackages, purchasePlan, syncPurchaser } = await load();
    await syncPurchaser('uid-alice');
    await loadPaywallPackages();
    await expect(purchasePlan('$rc_annual')).resolves.toBe('pending');
  });

  it('throws for a package that was never loaded', async () => {
    const { purchasePlan, syncPurchaser } = await load();
    await syncPurchaser('uid-alice');
    await expect(purchasePlan('$rc_annual')).rejects.toThrow(/unknown plan/i);
  });
});

describe('restoreProAccess', () => {
  it('returns true only when the pro entitlement is active', async () => {
    const { restoreProAccess, syncPurchaser } = await load();
    await syncPurchaser('uid-alice');
    await expect(restoreProAccess()).resolves.toBe(true);
    h.restorePurchases.mockResolvedValue({ customerInfo: freeInfo() });
    await expect(restoreProAccess()).resolves.toBe(false);
  });

  it('refuses to restore before anyone is identified', async () => {
    const { restoreProAccess } = await load();
    await expect(restoreProAccess()).rejects.toThrow(/not signed in/i);
    expect(h.restorePurchases).not.toHaveBeenCalled();
  });
});

describe('identity fails CLOSED (adversarial review 2026-10-14)', () => {
  it('a failed account switch blocks purchasing instead of buying for the previous user', async () => {
    const { loadPaywallPackages, purchasePlan, syncPurchaser } = await load();
    await syncPurchaser('uid-alice');
    await loadPaywallPackages();
    h.logIn.mockRejectedValue(new Error('offline'));
    await expect(syncPurchaser('uid-bob')).rejects.toThrow('offline');
    await expect(purchasePlan('$rc_annual')).rejects.toThrow();
    expect(h.purchasePackage).not.toHaveBeenCalled();
  });

  it('a failed sign-out logOut never lets the next user buy as the old one', async () => {
    const { loadPaywallPackages, purchasePlan, syncPurchaser } = await load();
    await syncPurchaser('uid-alice');
    await loadPaywallPackages();
    h.logOut.mockRejectedValueOnce(new Error('offline'));
    await expect(syncPurchaser(null)).rejects.toThrow('offline');
    h.logIn.mockRejectedValueOnce(new Error('offline'));
    await expect(syncPurchaser('uid-bob')).rejects.toThrow('offline');
    h.logIn.mockRejectedValue(new Error('still offline'));
    await expect(purchasePlan('$rc_annual')).rejects.toThrow();
    expect(h.purchasePackage).not.toHaveBeenCalled();
  });

  it('retries the identity switch on the next paywall action, then buys as the right user', async () => {
    const { loadPaywallPackages, purchasePlan, syncPurchaser } = await load();
    await syncPurchaser('uid-alice');
    h.logIn.mockRejectedValueOnce(new Error('offline'));
    await expect(syncPurchaser('uid-bob')).rejects.toThrow('offline');
    await loadPaywallPackages(); // retry happens here
    expect(h.logIn).toHaveBeenCalledTimes(2);
    expect(h.logIn).toHaveBeenLastCalledWith({ appUserID: 'uid-bob' });
    await expect(purchasePlan('$rc_annual')).resolves.toBe('purchased');
  });

  it('treats the iOS cancel shape (string code "1", no userCancelled) as cancelled', async () => {
    h.purchasePackage.mockRejectedValue({ code: '1', message: 'Purchase was cancelled.' });
    const { loadPaywallPackages, purchasePlan, syncPurchaser } = await load();
    await syncPurchaser('uid-alice');
    await loadPaywallPackages();
    await expect(purchasePlan('$rc_annual')).resolves.toBe('cancelled');
  });
});

describe('signed out after a failed logOut', () => {
  it('refuses to buy while signed out even though the SDK is still on the old user', async () => {
    const { loadPaywallPackages, purchasePlan, syncPurchaser } = await load();
    await syncPurchaser('uid-alice');
    await loadPaywallPackages();
    h.logOut.mockRejectedValueOnce(new Error('offline'));
    await expect(syncPurchaser(null)).rejects.toThrow('offline');
    await expect(purchasePlan('$rc_annual')).rejects.toThrow(/not signed in/i);
    expect(h.purchasePackage).not.toHaveBeenCalled();
  });
});
