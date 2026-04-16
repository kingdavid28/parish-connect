import React, { useState, useEffect } from "react";
import { useNavigate, Navigate, Link } from "react-router";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";
import { AlertCircle, Eye, EyeOff, CheckCircle2, XCircle, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { format } from "date-fns";
import logo from "/public/parish-connect-logo.png";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

interface PasswordRule {
  label: string;
  test: (p: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "One number", test: (p) => /\d/.test(p) },
];

export default function Signup() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", fatherFirstName: "" });
  const [birthday, setBirthday] = useState<Date | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Scroll the focused input above the keyboard on iOS
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const focused = document.activeElement as HTMLElement | null;
      if (!focused || !['INPUT', 'TEXTAREA'].includes(focused.tagName)) return;
      setTimeout(() => focused.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const passwordStrength = PASSWORD_RULES.filter((r) => r.test(form.password)).length;
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][passwordStrength];
  const strengthColor = ["", "bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-green-500"][passwordStrength];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.name.trim()) { setError("Full name is required."); return; }
    if (!form.fatherFirstName.trim()) { setError("Father's first name is required for verification."); return; }
    if (form.password !== form.confirm) { setError("Passwords do not match."); return; }
    if (passwordStrength < 3) { setError("Please choose a stronger password."); return; }
    if (!agreedToTerms) { setError("You must agree to the terms to continue."); return; }

    setIsLoading(true);
    try {
      // Format birthday as YYYY-MM-DD for the API
      const birthdayStr = format(birthday, "yyyy-MM-dd");

      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          birthday: birthdayStr,
          fatherFirstName: form.fatherFirstName.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message || "Registration failed. Please try again.");
        return;
      }

      await login(form.email.trim(), form.password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page flex items-start justify-center p-4 pt-8">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-2">
            <img src={logo} alt="Parish Connect" className="h-20 w-auto object-contain" width={80} height={80} />
          </div>
          <CardTitle className="text-2xl">Create Account</CardTitle>
          <CardDescription>Join your parish community today</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" type="text" placeholder="Juan dela Cruz" value={form.name} onChange={set("name")} required autoComplete="name" disabled={isLoading} />
              <p className="text-xs text-gray-500">Use your exact name as it appears in the parish sacramental records.</p>
            </div>

            {/* Birthday */}
            <div className="space-y-2">
              <Label>Birthday <span className="text-gray-400 font-normal text-xs">(optional if not in records)</span></Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={`w-full justify-start text-left font-normal ${!birthday ? 'text-muted-foreground' : ''}`} disabled={isLoading}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {birthday ? format(birthday, "MMM d, yyyy") : "Select your birthday"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={birthday}
                    onSelect={(date) => { setBirthday(date); setCalendarOpen(false); }}
                    captionLayout="dropdown"
                    fromYear={1920}
                    toYear={new Date().getFullYear()}
                    defaultMonth={birthday || new Date(2000, 0)}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Father's First Name */}
            <div className="space-y-2">
              <Label htmlFor="fatherFirstName">Father's First Name</Label>
              <Input id="fatherFirstName" type="text" placeholder="e.g. Jose" value={form.fatherFirstName} onChange={set("fatherFirstName")} required disabled={isLoading} />
              <p className="text-xs text-gray-500">For identity verification. Must match parish records.</p>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="your.email@parish.com" value={form.email} onChange={set("email")} required autoComplete="email" disabled={isLoading} />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={form.password} onChange={set("password")} required autoComplete="new-password" disabled={isLoading} className="pr-10" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {form.password && (
                <div className="space-y-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= passwordStrength ? strengthColor : "bg-gray-200"}`} />
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">Strength: <span className="font-medium">{strengthLabel}</span></p>
                  <ul className="space-y-1">
                    {PASSWORD_RULES.map((rule) => (
                      <li key={rule.label} className="flex items-center gap-1.5 text-xs">
                        {rule.test(form.password) ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-gray-300 shrink-0" />}
                        <span className={rule.test(form.password) ? "text-green-700" : "text-gray-400"}>{rule.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm Password</Label>
              <div className="relative">
                <Input id="confirm" type={showConfirm ? "text" : "password"} placeholder="••••••••" value={form.confirm} onChange={set("confirm")} required autoComplete="new-password" disabled={isLoading} className={`pr-10 ${form.confirm && form.confirm !== form.password ? "border-red-400 focus-visible:ring-red-400" : ""}`} />
                <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label={showConfirm ? "Hide password" : "Show password"}>
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {form.confirm && form.confirm !== form.password && <p className="text-xs text-red-500">Passwords do not match</p>}
            </div>

            {/* Terms */}
            <div className="flex items-start gap-2">
              <input id="terms" type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="h-4 w-4 mt-0.5 rounded border-gray-300 accent-blue-600" />
              <Label htmlFor="terms" className="text-sm font-normal cursor-pointer leading-snug">
                I agree to the <span className="text-blue-600 hover:underline cursor-pointer">Terms of Service</span> and <span className="text-blue-600 hover:underline cursor-pointer">Privacy Policy</span>
              </Label>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Creating account..." : "Create Account"}
            </Button>

            <p className="text-center text-sm text-gray-600">
              Already have an account? <Link to="/login" className="text-blue-600 hover:underline font-medium">Sign in</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
