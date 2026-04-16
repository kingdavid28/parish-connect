import React from "react";
import { Outlet } from "react-router";
import Navbar from "./Navbar";
import { Toaster } from "./ui/sonner";
import { NotificationPrompt } from "./NotificationPrompt";

export default function Layout() {
  return (
    <div className="viewport-bg">
      {/* Navbar is outside content wrapper for fixed positioning */}
      <Navbar />

      {/* Content wrapper with proper z-index stacking */}
      <div className="viewport-content">
        <Outlet />
      </div>

      {/* Delayed soft push-permission prompt — only shown to authenticated users */}
      <NotificationPrompt />

      {/* Toast notifications */}
      <Toaster />
    </div>
  );
}
