import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "./ui/avatar";

const logo = import.meta.env.BASE_URL + "parish-connect-logo.png";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuShortcut,
} from "./ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  Home, BookOpen, Users, Settings as SettingsIcon, LogOut, Shield, Crown,
  UserCircle, ChevronDown, MessageCircle,
} from "lucide-react";
import { toast } from "sonner";

export default function Navbar() {
  const { user, logout, isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const navLinks = [
    { path: "/", label: "Feed", icon: Home, showFor: "all" },
    { path: "/messages", label: "Messages", icon: MessageCircle, showFor: "all" },
    { path: "/records", label: "Records", icon: BookOpen, showFor: "all" },
    { path: "/membership", label: "Members", icon: Users, showFor: "admin" },
    { path: "/admin", label: "Manage", icon: Shield, showFor: "admin" },
  ];

  const visibleNavLinks = navLinks.filter((link) => {
    if (link.showFor === "all") return true;
    if (link.showFor === "admin") return isAdmin;
    return false;
  });

  const isActive = (path: string) => location.pathname === path;

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase();

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
    setShowLogoutDialog(false);
  };

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Q') {
        e.preventDefault();
        setShowLogoutDialog(true);
      }
    };
    globalThis.addEventListener('keydown', handleKeyPress);
    return () => globalThis.removeEventListener('keydown', handleKeyPress);
  }, []);

  if (!isAuthenticated) return null;

  return (
    <>
      {/* Top Bar */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center h-14">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
              <img src={logo} alt="Parish Connect" className="h-9 w-auto object-contain" width={36} height={36} />
              <div className="hidden sm:block leading-tight">
                <span className="text-lg font-semibold text-gray-900">Parish Connect</span>
                <span className="block text-[10px] text-gray-400 -mt-0.5">sanvicenteferrerparish-franciscans</span>
              </div>
            </Link>

            {/* Desktop Nav - centered */}
            <div className="hidden md:flex items-center gap-1">
              {visibleNavLinks.map((link) => {
                const Icon = link.icon;
                const active = isActive(link.path);
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${active
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* User Menu */}
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative flex items-center gap-2 h-9 px-2 rounded-full hover:bg-gray-100">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={user?.avatar} alt={user?.name} />
                      <AvatarFallback className="text-xs">{user && getInitials(user.name)}</AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline text-sm font-medium text-gray-700 max-w-[120px] truncate">{user?.name}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel>
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-medium">{user?.name}</p>
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                      <div className="pt-0.5">
                        {user?.role === "superadmin" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-600 text-white">
                            <Crown className="h-3 w-3 mr-1" />Super Admin
                          </span>
                        )}
                        {user?.role === "admin" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            <Shield className="h-3 w-3 mr-1" />Admin
                          </span>
                        )}
                        {user?.role === "parishioner" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">Parishioner</span>
                        )}
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to={`/profile/${user?.id}`} className="cursor-pointer">
                      <UserCircle className="mr-2 h-4 w-4" />My Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/settings" className="cursor-pointer">
                      <SettingsIcon className="mr-2 h-4 w-4" />Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowLogoutDialog(true)} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50">
                    <LogOut className="mr-2 h-4 w-4" />Logout
                    <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Tab Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
        <div className="flex justify-around items-center h-16 px-2">
          {visibleNavLinks.slice(0, 5).map((link) => {
            const Icon = link.icon;
            const active = isActive(link.path);
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-lg transition-colors ${active ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
                  }`}
              >
                <div className={`p-1.5 rounded-full transition-colors ${active ? "bg-blue-50" : ""}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-medium">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom padding spacer for mobile */}
      <div className="md:hidden h-16" />

      {/* Logout Dialog */}
      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-start gap-4">
              <div className="bg-red-100 p-3 rounded-full">
                <LogOut className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1">
                <AlertDialogTitle>Logout from Parish Connect?</AlertDialogTitle>
                <AlertDialogDescription className="mt-2">
                  You're about to logout as <strong>{user?.name}</strong>. You'll need to sign in again.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay Logged In</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout} className="bg-red-600 hover:bg-red-700">
              <LogOut className="h-4 w-4 mr-2" />Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
