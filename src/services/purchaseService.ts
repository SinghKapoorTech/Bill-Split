import { Capacitor } from '@capacitor/core';
import {
  Purchases,
  LOG_LEVEL,
  INTRO_ELIGIBILITY_STATUS,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
} from '@revenuecat/purchases-capacitor';
import type { PaywallPackageInput } from '@/utils/paywallPlans';

/**
 * RevenueCat client wrapper.
 *
 * NATIVE-ONLY. Web billing is out of scope (Guideline 3.1.1 also forbids
 * selling the iOS subscription from the web build), so every export no-ops on
 * the web instead of throwing — the same UI renders in a browser without a
 * platform check at each call site.
 *
 * THE ONE PROPERTY THAT MATTERS: RevenueCat's `appUserID` IS the Firebase uid.
 * It becomes `app_user_id` on every webhook event, and the webhook writes
 * `entitlements/{app_user_id}`. Configured anonymously, every purchase arrives
 * unattachable (422 `unresolved-uid`); left on a previous user's id after an
 * account switch, a purchase lands on the WRONG account.
 */

/**
 * RevenueCat Test Store key (`test_…`): fake purchases through RevenueCat's own
 * modal, so a simulator build can be tested end to end without an Apple sandbox
 * account. NEVER in a production-mode build: the native SDK deliberately
 * crashes a release build (TestFlight/App Store) configured with a test key.
 * Set it only in the gitignored `.env.beta` (`vite build --mode beta`).
 */
function testStoreKey(): string | undefined {
  if (import.meta.env.MODE === 'production') return undefined;
  const key = import.meta.env.VITE_REVENUECAT_TEST_KEY;
  return typeof key === 'string' && key.length > 0 ? key : undefined;
}

function platformApiKey(): string | undefined {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios' || platform === 'android') {
    const testKey = testStoreKey();
    if (testKey) return testKey;
  }
  const key =
    platform === 'ios'
      ? import.meta.env.VITE_REVENUECAT_IOS_KEY
      : platform === 'android'
        ? import.meta.env.VITE_REVENUECAT_ANDROID_KEY
        : undefined;
  return typeof key === 'string' && key.length > 0 ? key : undefined;
}

/** True when this build can sell: native platform AND a key for it. */
export function isPurchasingAvailable(): boolean {
  return Capacitor.isNativePlatform() && platformApiKey() !== undefined;
}

// `configure` is once per process; later identities go through logIn/logOut.
let configured = false;
// The uid the native SDK is actually on. Only updated after logIn/logOut
// SUCCEEDS, so after a failed switch it still names the PREVIOUS user.
let currentUid: string | null = null;
// The uid the app WANTS (latest auth state). Buying requires the two to match,
// so a failed switch fails CLOSED instead of buying for the previous user.
let desiredUid: string | null = null;
// Auth events are serialised: onAuthStateChanged can fire twice in quick
// succession, and a second call that ran before `configure` settled would
// configure again or call logIn on an unconfigured SDK.
let queue: Promise<void> = Promise.resolve();

async function applyIdentity(uid: string | null): Promise<void> {
  if (!isPurchasingAvailable()) return;

  if (uid) {
    if (!configured) {
      await Purchases.configure({ apiKey: platformApiKey()!, appUserID: uid });
      configured = true;
      currentUid = uid;
      if (import.meta.env.DEV) {
        await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG }).catch(() => undefined);
      }
      return;
    }
    if (uid !== currentUid) {
      await Purchases.logIn({ appUserID: uid });
      currentUid = uid;
    }
    return;
  }

  // Signed out. logOut throws when the current user is anonymous, so only call
  // it when we actually identified someone.
  if (configured && currentUid !== null) {
    await Purchases.logOut();
    currentUid = null;
  }
}

// ---------------------------------------------------------------- selling

/** RevenueCat entitlement identifier, attached to both Pro products. */
const PRO_ENTITLEMENT = 'pro';

// The SDK must be handed back the exact package object it returned.
let loadedPackages = new Map<string, PurchasesPackage>();

/**
 * Resolve once every queued identity change has applied, then require that
 * someone is identified. Buying (or restoring) as an anonymous RevenueCat user
 * produces a purchase the webhook can never attach to an account.
 */
async function requireIdentified(): Promise<void> {
  await queue;
  // A switch that failed earlier (offline at sign-in) is retried here, so the
  // paywall's "Try again" recovers instead of staying dead for the session.
  if (desiredUid !== null && currentUid !== desiredUid) {
    await syncPurchaser(desiredUid);
  }
  if (!configured || currentUid === null || currentUid !== desiredUid) {
    throw new Error('Purchases: not signed in');
  }
}

const isPro = (info: CustomerInfo) => info.entitlements.active[PRO_ENTITLEMENT] !== undefined;

function eligibilityOf(status: INTRO_ELIGIBILITY_STATUS | undefined): boolean | null {
  if (status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE) return true;
  if (status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE) return false;
  return null;
}

/** The current offering's packages, shaped for `buildPaywallPlans`. */
export async function loadPaywallPackages(): Promise<PaywallPackageInput[]> {
  await requireIdentified();
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  if (packages.length === 0) throw new Error('Purchases: no current offering');

  // Eligibility only drives trial COPY; a failed lookup means "unknown", which
  // hides the trial copy (see paywallPlans) — the store itself decides what is charged.
  let eligibility: Record<string, { status: INTRO_ELIGIBILITY_STATUS }> = {};
  try {
    eligibility = await Purchases.checkTrialOrIntroductoryPriceEligibility({
      productIdentifiers: packages.map((p) => p.product.identifier),
    });
  } catch {
    eligibility = {};
  }

  loadedPackages = new Map(packages.map((p) => [p.identifier, p]));
  return packages.map((p) => ({
    id: p.identifier,
    packageType: p.packageType,
    price: p.product.price,
    priceString: p.product.priceString,
    intro: p.product.introPrice
      ? {
          price: p.product.introPrice.price,
          periodUnit: p.product.introPrice.periodUnit,
          periodNumberOfUnits: p.product.introPrice.periodNumberOfUnits,
        }
      : null,
    trialEligible: eligibilityOf(eligibility[p.product.identifier]?.status),
  }));
}

/**
 * - `purchased`: the store charged (or started a trial) and Pro is active.
 * - `pending`: the store accepted it but Pro is not active yet (Ask to Buy,
 *   deferred payment). The webhook grants it when it settles.
 * - `cancelled`: the user dismissed the sheet — not an error.
 */
export type PurchaseOutcome = 'purchased' | 'pending' | 'cancelled';

export async function purchasePlan(packageId: string): Promise<PurchaseOutcome> {
  await requireIdentified();
  const aPackage = loadedPackages.get(packageId);
  if (!aPackage) throw new Error(`Purchases: unknown plan ${packageId}`);
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage });
    return isPro(customerInfo) ? 'purchased' : 'pending';
  } catch (error) {
    const e = error as { code?: string; userCancelled?: boolean | null };
    if (e?.userCancelled === true || e?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      return 'cancelled';
    }
    throw error;
  }
}

/** Restore from the store account. True when that leaves Pro active. */
export async function restoreProAccess(): Promise<boolean> {
  await requireIdentified();
  const { customerInfo } = await Purchases.restorePurchases();
  return isPro(customerInfo);
}

/**
 * Point RevenueCat at the signed-in Firebase user (or log out on `null`).
 *
 * Callers must NOT block auth on this — a RevenueCat outage must not stop
 * anyone using the free app. Rejections are surfaced so the caller can log.
 */
export function syncPurchaser(uid: string | null): Promise<void> {
  desiredUid = uid;
  const next = queue.then(() => applyIdentity(uid));
  // Keep the chain alive after a failure so the next event still runs.
  queue = next.catch(() => undefined);
  return next;
}
