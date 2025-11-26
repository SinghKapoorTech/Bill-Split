import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { App as CapApp } from "@capacitor/app";
import { AuthProvider } from "@/contexts/AuthContext";
import { BillSessionProvider } from "@/contexts/BillSessionContext";
import { Layout } from "@/components/layout/Layout";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import AIScanView from "./pages/AIScanView";
import GroupEventView from "./pages/GroupEventView";
import GroupDetailView from "./pages/GroupDetailView";
import SettingsView from "./pages/SettingsView";
import Auth from "./pages/Auth";
import JoinSession from "./pages/JoinSession";
import CollaborativeSessionView from "./pages/CollaborativeSessionView";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for deep links
    const listener = CapApp.addListener('appUrlOpen', (event) => {
      const url = event.url;
      console.log('Deep link opened:', url);

      // Parse the URL to extract the path
      // Expected format: https://bill-split-lemon.vercel.app/join/sessionId?code=ABC123
      try {
        const urlObj = new URL(url);
        const path = urlObj.pathname + urlObj.search;
        navigate(path);
      } catch (error) {
        console.error('Error parsing deep link URL:', error);
      }
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, [navigate]);

  return null;
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
            {/* Landing page - no layout */}
            <Route path="/" element={<LandingPage />} />
            
            {/* App routes - with layout */}
            <Route element={<Layout />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="bill/:billId" element={<AIScanView />} />
              <Route path="groups" element={<GroupEventView />} />
              <Route path="groups/:groupId" element={<GroupDetailView />} />
              <Route path="settings" element={<SettingsView />} />
              <Route path="session/:sessionId" element={<CollaborativeSessionView />} />
            </Route>
            
            {/* Standalone routes */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/join/:sessionId" element={<JoinSession />} />
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </BillSessionProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
