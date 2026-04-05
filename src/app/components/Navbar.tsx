import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "./ui/avatar";

const logo = import.meta.env.BASE_URL + "parish-connect-logo.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuShortcut,
} from "./ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  Home,
  BookOpen,
  Users,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
  Shield,
  Crown,
  UserCircle,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

export default function Navbar() {
  const { user, logout, isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const navLinks = [
    { path: "/", label: "Feed", icon: Home, showFor: "all" },
    { path: "/records", label: "Parish Records", icon: BookOpen, showFor: "all" },
    { path: "/membership", label: "Membership", icon: Users, showFor: "all" },
    { path: "/admin", label: "User Management", icon: Shield, showFor: "admin" },
  ];

  // Filter nav links based on user role
  const visibleNavLinks = navLinks.filter((link) => {
    if (link.showFor === "all") return true;
    if (link.showFor === "admin") return isAdmin;
    return false;
  });

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  const handleLogout = () => {
    logout();
    toast.success("You have been logged out successfully");
    setShowLogoutDialog(false);
  };

  // Keyboard shortcut for logout (Ctrl/Cmd + Shift + Q)
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

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and Brand */}
            <div className="flex items-center">
              <Link to="/" className="flex items-center space-x-2">
                <img
                  src={logo}
                  alt="Parish Connect"
                  className="h-10 w-auto object-contain"
                  width={40}
                  height={40}
                />
                <span className="text-xl font-semibold text-gray-900 hidden sm:block">
                  Parish Connect
                </span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-1">
              {visibleNavLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${isActive(link.path)
                        ? "bg-blue-50 text-blue-600"
                        : "text-gray-600 hover:bg-gray-100"
                      }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLogoutDialog(true)}
                className="text-gray-600 hover:text-red-600 hover:bg-red-50 ml-2"
                aria-label="Logout"
                title="Logout (Ctrl+Shift+Q)"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>

            {/* User Menu */}
            <div className="flex items-center space-x-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative flex items-center gap-2 h-10 px-3"
                    aria-label="Open user menu"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.avatar} alt={user?.name} />
                      <AvatarFallback>
                        {user && getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline text-sm font-medium">{user?.name}</span>
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user?.name}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                      <div className="pt-1">
                        {user?.role === "superadmin" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-600 text-white">
                            <Crown className="h-3 w-3 mr-1" />
                            Super Admin
                          </span>
                        )}
                        {user?.role === "admin" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            <Shield className="h-3 w-3 mr-1" />
                            Admin
                          </span>
                        )}
                        {user?.role === "parishioner" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            Parishioner
                          </span>
                        )}
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to={`/profile/${user?.id}`} className="cursor-pointer">
                      <UserCircle className="mr-2 h-4 w-4" />
                      My Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/settings" className="cursor-pointer">
                      <SettingsIcon className="mr-2 h-4 w-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowLogoutDialog(true)}
                    className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                    <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile Menu Button */}
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </Button>
            </div>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-gray-200">
              <div className="flex flex-col space-y-2">
                {visibleNavLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.path}
                      to={link.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${isActive(link.path)
                          ? "bg-blue-50 text-blue-600"
                          : "text-gray-600 hover:bg-gray-100"
                        }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
                <div className="pt-2 border-t border-gray-200">
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setShowLogoutDialog(true);
                    }}
                  >
                    <LogOut className="h-5 w-5 mr-2" />
                    Logout
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Logout Confirmation Dialog */}
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
                  You're about to logout as <strong>{user?.name}</strong>. You'll need to sign in again to access your parish community and activity feed.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay Logged In</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}