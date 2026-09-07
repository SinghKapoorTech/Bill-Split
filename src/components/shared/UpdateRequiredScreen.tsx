import { Capacitor } from '@capacitor/core';
import { ArrowUpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Store links, verified against the repo rather than guessed:
 * bundle/application id `com.singhkapoortech.divit` (capacitor.config.ts,
 * android/app/build.gradle) and ASC app id `6760331853` (appstore/SUBMISSION.md).
 * A wrong id here turns the only escape hatch on this screen into a dead end.
 */
const IOS_STORE_URL = 'https://apps.apple.com/app/id6760331853';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.singhkapoortech.divit';

/**
 * The update wall. Replaces the entire app, so it is deliberately the smallest,
 * calmest screen in the codebase.
 *
 * It is shown ONLY on positive evidence that the installed build is too old to
 * talk to the current backend (see `shared/versionGate.ts`, which fails open on
 * every ambiguity). There is intentionally no dismiss affordance: a build below
 * the floor cannot complete the flows it offers, so letting someone past would
 * hand them a series of unexplained permission errors instead of one clear
 * instruction.
 *
 * The copy says what happened and what to do, and does NOT apologise at length
 * or explain backend versioning — the user does not care why.
 */
export function UpdateRequiredScreen() {
  const platform = Capacitor.getPlatform();
  const storeUrl = platform === 'android' ? PLAY_STORE_URL : IOS_STORE_URL;

  return (
    <div className="fixed inset-0 w-full h-full flex items-center justify-center bg-gradient-to-b from-background to-secondary/30 p-6">
      <div className="text-center space-y-5 max-w-sm">
        <ArrowUpCircle className="w-14 h-14 text-primary mx-auto" aria-hidden="true" />

        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Update Divit to continue</h1>
          <p className="text-sm text-muted-foreground">
            This version is out of date and can no longer sync with your bills. Update to the latest
            version to pick up where you left off.
          </p>
        </div>

        {/*
          A plain link, not an in-app store SDK: the whole point is that this
          build may be too old to be trusted, so the escape hatch must depend on
          as little of it as possible.
        */}
        <Button asChild className="w-full">
          <a href={storeUrl} target="_blank" rel="noopener noreferrer">
            {platform === 'android' ? 'Open Google Play' : 'Open the App Store'}
          </a>
        </Button>

        {/*
          Reassurance, because an update wall reads as data loss to a lot of
          people — and here it genuinely is not: everything is server-side.
        */}
        <p className="text-xs text-muted-foreground">
          Your bills and balances are safe — they're stored on your account, not on this device.
        </p>
      </div>
    </div>
  );
}
