/**
 * Haptic Feedback Utility
 * Provides haptic feedback for native mobile apps using Capacitor
 * Falls back gracefully when not available (web browser)
 */

// Check if we're in a Capacitor native environment
const isNative = (): boolean => {
    return typeof window !== 'undefined' &&
        'Capacitor' in window &&
        (window as any).Capacitor?.isNativePlatform?.();
};

// Haptic impact styles
export type HapticStyle = 'light' | 'medium' | 'heavy';
export type NotificationType = 'success' | 'warning' | 'error';

// Lazy load Capacitor Haptics plugin
let hapticsModule: any = null;

async function getHaptics() {
    if (!isNative()) return null;

    if (!hapticsModule) {
        try {
            hapticsModule = await import('@capacitor/haptics');
        } catch (e) {
            console.warn('Haptics plugin not available:', e);
            return null;
        }
    }
    return hapticsModule;
}

/**
 * Trigger impact haptic feedback
 * Use for button taps, toggles, and general interactions
 */
export async function hapticImpact(style: HapticStyle = 'light'): Promise<void> {
    const haptics = await getHaptics();
    if (!haptics) return;

    const styleMap = {
        light: haptics.ImpactStyle.Light,
        medium: haptics.ImpactStyle.Medium,
        heavy: haptics.ImpactStyle.Heavy,
    };

    try {
        await haptics.Haptics.impact({ style: styleMap[style] });
    } catch (e) {
        // Silently fail - haptics not critical
    }
}

/**
 * Trigger notification haptic feedback
 * Use for success, warning, or error states
 */
export async function hapticNotification(type: NotificationType = 'success'): Promise<void> {
    const haptics = await getHaptics();
    if (!haptics) return;

    const typeMap = {
        success: haptics.NotificationType.Success,
        warning: haptics.NotificationType.Warning,
        error: haptics.NotificationType.Error,
    };

    try {
        await haptics.Haptics.notification({ type: typeMap[type] });
    } catch (e) {
        // Silently fail
    }
}

/**
 * Trigger selection change haptic
 * Use for picker wheels, sliders, and selection changes
 */
export async function hapticSelection(): Promise<void> {
    const haptics = await getHaptics();
    if (!haptics) return;

    try {
        await haptics.Haptics.selectionChanged();
    } catch (e) {
        // Silently fail
    }
}

/**
 * Vibrate for a duration (Android only)
 * Use sparingly - can be jarring
 */
export async function hapticVibrate(duration: number = 300): Promise<void> {
    const haptics = await getHaptics();
    if (!haptics) return;

    try {
        await haptics.Haptics.vibrate({ duration });
    } catch (e) {
        // Silently fail
    }
}

// Pre-configured haptic patterns for common actions
export const haptics = {
    // Button interactions
    buttonTap: () => hapticImpact('light'),
    buttonPress: () => hapticImpact('medium'),

    // Toggles and switches
    toggleOn: () => hapticImpact('medium'),
    toggleOff: () => hapticImpact('light'),

    // Navigation
    stepComplete: () => hapticNotification('success'),
    swipeNavigate: () => hapticSelection(),

    // Assignments
    assign: () => hapticImpact('light'),
    unassign: () => hapticImpact('light'),

    // Errors and warnings
    error: () => hapticNotification('error'),
    warning: () => hapticNotification('warning'),

    // Success states
    success: () => hapticNotification('success'),
    complete: () => hapticNotification('success'),

    // Selection
    select: () => hapticSelection(),
};

export default haptics;
