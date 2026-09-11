import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { App as CapApp } from "@capacitor/app";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { BillSessionProvider } from "@/contexts/BillSessionContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { Layout } from "@/components/layout/Layout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { usePlatform } from "@/hooks/usePlatform";
import { useMinimumVersion } from "@/hooks/useMinimumVersion";
import { UpdateRequiredScreen } from "@/components/shared/UpdateRequiredScreen";
import { LoadingScreen } from "@/components/shared/LoadingScreen";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import AIScanView from "./pages/AIScanView";
import EventsView from "./pages/EventsView";
import EventDetailView from "./pages/EventDetailView";
import SettingsView from "./pages/SettingsView";
import Auth from "./pages/Auth";
import MobileAuth from "./pages/MobileAuth";
import JoinSession from "./pages/JoinSession";
import CollaborativeSessionView from "./pages/CollaborativeSessionView";
import NotFound from "./pages/NotFound";
import UpgradeView from "./pages/UpgradeView";
import SquadsView from "./pages/SquadsView";
import SquadDetailView from "./pages/SquadDetailView";
import SimpleTransactionView from "./pages/SimpleTransactionView";
import AirbnbView from "./pages/AirbnbView";
import RecurringBillView from "./pages/RecurringBillView";
import BalanceDetailView from "./pages/BalanceDetailView";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Contact from "./pages/Contact";
import BillsView from "./pages/BillsView";
import { SettlementRequestsProvider } from "@/hooks/useSettlementRequests";
import { deepLinkToRoute } from "@/utils/deepLink";

const queryClient = new QueryClient();

function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for deep links
    let listenerHandle: { remove: () => void } | null = null;
    let cancelled = false;

    CapApp.addListener('appUrlOpen', (event) => {
      const url = event.url;

      // Custom-scheme and universal links parse differently; see deepLink.ts.
      const route = deepLinkToRoute(url);
      if (route) {
        navigate(route);
      } else {
        console.error('Unroutable deep link URL:', url);
      }
    }).then(handle => {
      if (cancelled) {
        handle.remove();
      } else {
        listenerHandle = handle;
      }
    });

    return () => {
      cancelled = true;
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [navigate]);

  return null;
}

/**
 * Platform-aware root route component
 * - Native app + not logged in: Show MobileAuth
 * - Native app + logged in: Redirect to dashboard
 * - Web browser: Show LandingPage (regardless of auth)
 */
function RootRoute() {
  const { user, loading } = useAuth();
  const { isNative } = usePlatform();

  // Show loading screen while auth is still resolving. `user === undefined`
  // means Firebase has not answered yet — on native this prevents flashing the
  // sign-in screen before a persisted session is restored.
  if (loading || user === undefined) {
    return <LoadingScreen />;
  }

  // Native app flow
  if (isNative) {
    if (user) {
      return <Navigate to="/dashboard" replace />;
    }
    return <MobileAuth />;
  }

  // Web browser flow (unchanged)
  return <LandingPage />;
}

/**
 * Wraps the app in the minimum-supported-version wall.
 *
 * Placed OUTSIDE every provider and the router on purpose. A build below the
 * floor cannot talk to the backend, so mounting auth, Firestore listeners and
 * the bill session underneath it would only produce a burst of errors behind a
 * screen nobody can act on.
 *
 * Waits only briefly (1.5s) rather than blocking on the network — see
 * useMinimumVersion. The Remote Config value is cached for an hour, so a cold
 * start within that window is free; a later one does a real round-trip and can
 * spend the full budget on LoadingScreen before rendering anyway.
 */
function VersionGate({ children }: { children: React.ReactNode }) {
  const { updateRequired, checking } = useMinimumVersion();

  if (updateRequired) return <UpdateRequiredScreen />;

  // A brief, BOUNDED wait (see useMinimumVersion) so a too-old build meets the
  // wall on the first frame rather than being yanked into it mid-action. The
  // budget is short and the value is cached locally after the first fetch, so
  // this is a no-op on essentially every launch — and when it does expire, the
  // app renders regardless.
  if (checking) return <LoadingScreen />;

  return <>{children}</>;
}

const App = () => (
  <VersionGate>
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SettlementRequestsProvider>
        <BillSessionProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <DeepLinkHandler />
              <Routes>
                {/* Public: Platform-aware root route */}
                <Route path="/" element={<RootRoute />} />

                {/* Protected routes with layout */}
                <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="bill/:billId" element={<AIScanView />} />
                  <Route path="transaction/:billId" element={<SimpleTransactionView />} />
                  <Route path="airbnb/:billId" element={<AirbnbView />} />
                  <Route path="recurring/new" element={<RecurringBillView />} />
                  <Route path="recurring/:recurringBillId" element={<RecurringBillView />} />
                  <Route path="events" element={<EventsView />} />
                  <Route path="events/:eventId" element={<EventDetailView />} />
                  <Route path="squads" element={<SquadsView />} />
                  <Route path="squads/:squadId" element={<SquadDetailView />} />
                  <Route path="balances/:targetUserId" element={<BalanceDetailView />} />
                  <Route path="events/:eventId/balances/:targetUserId" element={<BalanceDetailView />} />
                  <Route path="settings" element={<SettingsView />} />
                  <Route path="upgrade" element={<UpgradeView />} />
                  <Route path="bills" element={<BillsView />} />
                  <Route path="shared/:sessionId" element={<CollaborativeSessionView />} />
                </Route>

                {/* Public: Auth, join, and collaborative session pages */}
                <Route path="/auth" element={<Auth />} />
                <Route path="/join/:sessionId" element={<JoinSession />} />
                <Route path="/session/:sessionId" element={<CollaborativeSessionView />} />

                {/* Public: legal pages */}
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/contact" element={<Contact />} />

                {/* Public: 404 */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </BillSessionProvider>
        </SettlementRequestsProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
  </VersionGate>
);

export default App;
