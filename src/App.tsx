import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { App as CapApp } from "@capacitor/app";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { BillSessionProvider } from "@/contexts/BillSessionContext";
import { Layout } from "@/components/layout/Layout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { usePlatform } from "@/hooks/usePlatform";
import { LoadingScreen } from "@/components/shared/LoadingScreen";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import AIScanView from "./pages/AIScanView";
import GroupEventView from "./pages/GroupEventView";
import GroupDetailView from "./pages/GroupDetailView";
import SettingsView from "./pages/SettingsView";
import Auth from "./pages/Auth";
import MobileAuth from "./pages/MobileAuth";
import JoinSession from "./pages/JoinSession";
import CollaborativeSessionView from "./pages/CollaborativeSessionView";
import NotFound from "./pages/NotFound";
import SquadsView from "./pages/SquadsView";

const queryClient = new QueryClient();

function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for deep links
    let listenerHandle: any = null;

    CapApp.addListener('appUrlOpen', (event) => {
      const url = event.url;

      // Parse the URL to extract the path
      // Expected format: https://bill-split-lemon.vercel.app/join/sessionId?code=ABC123
      try {
        const urlObj = new URL(url);
        const path = urlObj.pathname + urlObj.search;
        navigate(path);
      } catch (error) {
        console.error('Error parsing deep link URL:', error);
      }
    }).then(handle => {
      listenerHandle = handle;
    });

    return () => {
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

  // Show loading screen during auth state check
  if (loading) {
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <BillSessionProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <DeepLinkHandler />
            <Routes>
              {/* Public: Platform-aware root route */}
              <Route path="/" element={<RootRoute />} />

              {/* Protected routes with layout */}
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="bill/:billId" element={<AIScanView />} />
                <Route path="groups" element={<GroupEventView />} />
                <Route path="groups/:groupId" element={<GroupDetailView />} />
                <Route path="squads" element={<SquadsView />} />
                <Route path="settings" element={<SettingsView />} />
              </Route>

              {/* Public: Auth, join, and collaborative session pages */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/join/:sessionId" element={<JoinSession />} />
              <Route path="/session/:sessionId" element={<CollaborativeSessionView />} />

              {/* Public: 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </BillSessionProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
