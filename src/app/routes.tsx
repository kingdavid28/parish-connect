import { createBrowserRouter, Navigate } from "react-router";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./components/Login";
import Signup from "./components/Signup";
import Feed from "./pages/Feed";
import Profile from "./pages/Profile";
import ParishRecords from "./pages/ParishRecords";
import Membership from "./pages/Membership";
import Settings from "./pages/Settings";
import AdminManagement from "./pages/AdminManagement";
import Messages from "./pages/Messages";
import NotFound from "./pages/NotFound";

export const router = createBrowserRouter([
  { path: "/login", Component: Login },
  { path: "/signup", Component: Signup },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, Component: Feed },
      { path: "profile/:id", Component: Profile },
      { path: "messages", Component: Messages },
      { path: "records", Component: ParishRecords },
      { path: "membership", Component: Membership },
      { path: "settings", Component: Settings },
      {
        path: "admin",
        element: (
          <ProtectedRoute requireAdmin>
            <AdminManagement />
          </ProtectedRoute>
        ),
      },
    ],
  },
  { path: "*", Component: NotFound },
], { basename: import.meta.env.PROD ? "/parish-connect" : "/" });
