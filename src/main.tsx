import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./app/App.tsx";
import "./styles/index.css";

// Initialise Sentry — only when a DSN is configured (skipped in dev if env is empty)
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    // Capture 10% of sessions for performance tracing in production
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 0,
    // Capture 100% of replays on error, 0% on normal sessions
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
  });
}

// Register service worker for push notifications
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/parish-connect/sw.js", { scope: "/parish-connect/" })
      .catch((err) => console.error("SW registration failed:", err));
  });
}

createRoot(document.getElementById("root")!).render(<App />);
