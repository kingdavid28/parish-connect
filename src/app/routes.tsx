import { createBrowserRouter } from "react-router";
import React, { lazy, Suspense } from "react";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./components/Login";
import Signup from "./components/Signup";
import { PageLoading } from "./components/LoadingState";

// Lazy-load all page-level components so the initial bundle is small
const Feed = lazy(() => import("./pages/Feed"));
const Profile = lazy(() => import("./pages/Profile"));
const ParishRecords = lazy(() => import("./pages/ParishRecords"));
const Membership = lazy(() => import("./pages/Membership"));
const Settings = lazy(() => import("./pages/Settings"));
const AdminManagement = lazy(() => import("./pages/AdminManagement"));
const Messages = lazy(() => import("./pages/Messages"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const QRCodePage = lazy(() => import("./pages/QRCode"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Rewards = lazy(() => import("./pages/Rewards"));
const Wallet = lazy(() => import("./pages/Wallet"));

// Wrap lazy pages in Suspense
const withSuspense = (Component: React.ComponentType) => (
  <Suspense fallback={<PageLoading />}>
    <Component />
  </Suspense>
);

export const router = createBrowserRouter([
  { path: "/login", Component: Login },
  { path: "/signup", Component: Signup },
  { path: "/forgot-password", element: withSuspense(ForgotPassword) },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: withSuspense(Feed) },
      { path: "profile/:id", element: withSuspense(Profile) },
      { path: "messages", element: withSuspense(Messages) },
      { path: "records", element: withSuspense(ParishRecords) },
      { path: "qrcode", element: withSuspense(QRCodePage) },
      { path: "membership", element: withSuspense(Membership) },
      { path: "settings", element: withSuspense(Settings) },
      { path: "rewards", element: withSuspense(Rewards) },
      { path: "wallet", element: withSuspense(Wallet) },
      {
        path: "admin",
        element: (
          <ProtectedRoute requireAdmin>
            <Suspense fallback={<PageLoading />}>
              <AdminManagement />
            </Suspense>
          </ProtectedRoute>
        ),
      },
    ],
  },
  { path: "*", element: withSuspense(NotFound) },
], { basename: import.meta.env.PROD ? "/parish-connect" : "/" });
