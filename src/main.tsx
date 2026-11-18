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

// Auto-recover from stale-chunk errors after a deploy: a user with the app
// open can request a hashed chunk that no longer exists. Reload once to pick
// up the new index.html; the sessionStorage guard prevents reload loops.
const reloadOnceForStaleChunk = () => {
  if (sessionStorage.getItem("chunk-reload")) return;
  sessionStorage.setItem("chunk-reload", "1");
  window.location.reload();
};
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadOnceForStaleChunk();
});
const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
window.addEventListener("unhandledrejection", (event) => {
  if (CHUNK_ERROR.test(String(event.reason))) reloadOnceForStaleChunk();
});
window.addEventListener("error", (event) => {
  if (event.message && CHUNK_ERROR.test(event.message)) reloadOnceForStaleChunk();
});
window.addEventListener("load", () => sessionStorage.removeItem("chunk-reload"));

// Register service worker for push notifications (path follows the deploy base)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .catch((err) => console.error("SW registration failed:", err));
  });
}

createRoot(document.getElementById("root")!).render(<App />);
