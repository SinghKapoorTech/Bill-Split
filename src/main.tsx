import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "@/components/ErrorBoundary";
import "./index.css";
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

// Configure status bar for mobile platforms
if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Light }).catch(console.error);
  StatusBar.setBackgroundColor({ color: '#ffffff' }).catch(console.error);
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
