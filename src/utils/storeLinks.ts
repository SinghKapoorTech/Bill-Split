/**
 * Store links, verified against the repo rather than guessed:
 * bundle/application id `com.singhkapoortech.divit` (capacitor.config.ts,
 * android/app/build.gradle) and ASC app id `6760331853` (appstore/SUBMISSION.md).
 * A wrong id here turns an escape hatch into a dead end.
 */
export const IOS_STORE_URL = 'https://apps.apple.com/app/id6760331853';
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.singhkapoortech.divit';
