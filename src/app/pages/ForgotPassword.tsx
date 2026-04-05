import React, { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Calendar } from "../components/ui/calendar";
import { AlertCircle, CalendarIcon, CheckCircle2, Eye, EyeOff, XCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import logo from "/public/parish-connect-logo.png";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

const PASSWORD_RULES = [
    { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
    { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
    { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
    { label: "One number", test: (p: string) => /\d/.test(p) },
];

export default function ForgotPassword() {
    const navigate = useNavigate();
    const [step, setStep] = useState<1 | 2>(1);
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [birthday, setBirthday] = useState<Date | undefined>(undefined);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [fatherFirstName, setFatherFirstName] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const passwordStrength = PASSWORD_RULES.filter((r) => r.test(newPassword)).length;
    const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][passwordStrength];
    const strengthColor = ["", "bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-green-500"][passwordStrength];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (step === 1) {
            if (!email.trim() || !name.trim() || !birthday || !fatherFirstName.trim()) {
                setError("All fields are required.");
                return;
            }
            setStep(2);
            return;
        }

        // Step 2: set new password
        if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
        if (passwordStrength < 3) { setError("Please choose a stronger password."); return; }

        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE}/auth/forgot-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: email.trim(),
                    name: name.trim(),
                    birthday: format(birthday!, "yyyy-MM-dd"),
                    fatherFirstName: fatherFirstName.trim(),
                    newPassword,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
                setError(json.message || "Password reset failed.");
                if (res.status === 403) setStep(1); // Go back to identity step
                return;
            }
            toast.success("Password reset successfully!");
            navigate("/login", { replace: true });
        } catch {
            setError("Something went wrong. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader className="space-y-1 text-center">
                    <div className="flex justify-center mb-2">
                        <img src={logo} alt="Parish Connect" className="h-20 w-auto object-contain" width={80} height={80} />
                    </div>
                    <CardTitle className="text-2xl">Reset Password</CardTitle>
                    <CardDescription>
                        {step === 1 ? "Verify your identity using parish records" : "Set your new password"}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                        {error && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {step === 1 && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email Address</Label>
                                    <Input id="email" type="email" placeholder="your.email@parish.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="name">Full Name</Label>
                                    <Input id="name" type="text" placeholder="As it appears in parish records" value={name} onChange={(e) => setName(e.target.value)} required />
                                </div>
                                <div className="space-y-2">
                                    <Label>Birthday</Label>
                                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className={`w-full justify-start text-left font-normal ${!birthday ? 'text-muted-foreground' : ''}`}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {birthday ? format(birthday, "MMM d, yyyy") : "Select your birthday"}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar mode="single" selected={birthday} onSelect={(d) => { setBirthday(d); setCalendarOpen(false); }} captionLayout="dropdown" fromYear={1920} toYear={new Date().getFullYear()} defaultMonth={birthday || new Date(2000, 0)} />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="father">Father's First Name</Label>
                                    <Input id="father" type="text" placeholder="e.g. Jose" value={fatherFirstName} onChange={(e) => setFatherFirstName(e.target.value)} required />
                                    <p className="text-xs text-gray-500">Must match parish records for identity verification.</p>
                                </div>
                                <Button type="submit" className="w-full">Continue</Button>
                            </>
                        )}

                        {step === 2 && (
                            <>
                                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                                    Identity verified. Set your new password below.
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="newPassword">New Password</Label>
                                    <div className="relative">
                                        <Input id="newPassword" type={showPassword ? "text" : "password"} placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required className="pr-10" />
                                        <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                    {newPassword && (
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
                                                        {rule.test(newPassword) ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <XCircle className="h-3.5 w-3.5 text-gray-300" />}
                                                        <span className={rule.test(newPassword) ? "text-green-700" : "text-gray-400"}>{rule.label}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                                    <Input id="confirmPassword" type={showPassword ? "text" : "password"} placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className={confirmPassword && confirmPassword !== newPassword ? "border-red-400" : ""} />
                                    {confirmPassword && confirmPassword !== newPassword && <p className="text-xs text-red-500">Passwords do not match</p>}
                                </div>
                                <div className="flex gap-2">
                                    <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
                                    <Button type="submit" className="flex-1" disabled={isLoading}>
                                        {isLoading ? "Resetting..." : "Reset Password"}
                                    </Button>
                                </div>
                            </>
                        )}

                        <p className="text-center text-sm text-gray-600">
                            Remember your password? <Link to="/login" className="text-blue-600 hover:underline font-medium">Sign in</Link>
                        </p>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
