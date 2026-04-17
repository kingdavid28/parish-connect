import { RouterProvider } from "react-router";
import * as Sentry from "@sentry/react";
import { AuthProvider } from "./context/AuthContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { router } from "./routes";
import { Toaster } from "./components/ui/sonner";

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={<ErrorBoundary><></></ErrorBoundary>}>
      <ErrorBoundary>
        <AuthProvider>
          <RouterProvider router={router} />
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </ErrorBoundary>
    </Sentry.ErrorBoundary>
  );
}
