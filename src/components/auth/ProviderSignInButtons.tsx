import { Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import {
  Platform,
  SignInProvider,
  shouldOfferApple,
  shouldShowAppleWebHelpNotice,
} from '@/utils/authProviders';

interface ProviderSignInButtonsProps {
  onSignIn: (provider: SignInProvider) => void;
  /** The provider currently signing in, or null when idle. Drives the spinner. */
  pendingProvider: SignInProvider | null;
  /** Disables both buttons without spinning either — e.g. during a post-sign-in claim. */
  disabled?: boolean;
  /** Sizing/shape shared by every button so no provider looks more inviting. */
  buttonClassName?: string;
  /**
   * Icon size. Must use the `[&_svg]:` form — the Button primitive sets
   * `[&_svg]:size-4`, whose descendant-selector specificity beats a plain
   * `w-6` on the svg itself, so a bare utility class here does nothing.
   */
  iconSizeClassName?: string;
}

const AppleLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
    />
  </svg>
);

const GoogleLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

/**
 * The sign-in buttons, shared by the desktop and mobile auth screens.
 *
 * Sign in with Apple is present to satisfy App Store Review Guideline 4.8,
 * which requires an "equivalent option" alongside Google. Equivalent is taken
 * literally: both buttons get the same width, height and shape, and Apple is
 * listed first on the platform where it is offered.
 *
 * Apple's button follows their Human Interface Guidelines — the exact title
 * "Sign in with Apple", the glyph, and a minimum 44pt target. The black variant
 * is used on light backgrounds and the white variant on dark, which is what the
 * HIG prescribes: this app defaults to a near-black dark theme, and a black
 * button on it reads as a faint slab next to the white Google button.
 */
export const ProviderSignInButtons = ({
  onSignIn,
  pendingProvider,
  disabled = false,
  buttonClassName = '',
  iconSizeClassName = '[&_svg]:size-5',
}: ProviderSignInButtonsProps) => {
  const platform = Capacitor.getPlatform() as Platform;
  const offerApple = shouldOfferApple(platform);
  const busy = disabled || pendingProvider !== null;

  const shared = `w-full min-h-[44px] shadow-md hover:shadow-lg transition-all duration-300 disabled:opacity-50 ${iconSizeClassName} ${buttonClassName}`;

  /** Spinner on the pressed provider only; the other keeps its label. */
  const content = (provider: SignInProvider, logo: React.ReactNode, label: string) =>
    pendingProvider === provider ? (
      <>
        <Loader2 className="mr-3 animate-spin" />
        Signing in...
      </>
    ) : (
      <>
        {logo}
        {label}
      </>
    );

  return (
    <div className="space-y-3">
      {offerApple && (
        <Button
          onClick={() => onSignIn('apple')}
          disabled={busy}
          size="lg"
          className={`bg-black text-white hover:bg-neutral-900 border border-black dark:bg-white dark:text-black dark:hover:bg-neutral-100 dark:border-white ${shared}`}
        >
          {/* Nudged up a hair: the Apple glyph is optically low in its box. */}
          {content('apple', <AppleLogo className="mr-3 -mt-0.5" />, 'Sign in with Apple')}
        </Button>
      )}

      <Button
        onClick={() => onSignIn('google')}
        disabled={busy}
        size="lg"
        className={`bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 ${shared}`}
      >
        {content('google', <GoogleLogo className="mr-3" />, 'Sign in with Google')}
      </Button>

      {shouldShowAppleWebHelpNotice(platform) && (
        <p className="text-xs text-center text-muted-foreground">
          Signed up with Apple? In the Divit iOS app, go to Settings → Sign-in methods and add a
          password — then sign in with it here.
        </p>
      )}
    </div>
  );
};
