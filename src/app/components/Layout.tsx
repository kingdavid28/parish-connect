import React from "react";
import { Outlet } from "react-router";
import Navbar from "./Navbar";
import { Toaster } from "./ui/sonner";

export default function Layout() {
  return (
    <div className="viewport-bg">
      {/* Navbar is outside content wrapper for fixed positioning */}
      <Navbar />
      
      {/* Content wrapper with proper z-index stacking */}
      <div className="viewport-content">
        <Outlet />
      </div>
      
      {/* Toast notifications */}
      <Toaster />
    </div>
  );
}
