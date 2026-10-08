import { RouterProvider } from "react-router";
import * as Sentry from "@sentry/react";
import { AuthProvider } from "./context/AuthContext";
import { ParishConfigProvider } from "./context/ParishConfigContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { router } from "./routes";
import { Toaster } from "./components/ui/sonner";

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={<ErrorBoundary><></></ErrorBoundary>}>
      <ErrorBoundary>
        <ParishConfigProvider>
        <AuthProvider>
          <RouterProvider router={router} />
          <PWAInstallPrompt />
          <Toaster position="top-right" richColors />
        </AuthProvider>
        </ParishConfigProvider>
      </ErrorBoundary>
    </Sentry.ErrorBoundary>
  );
}
