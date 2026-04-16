import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "./ui/button";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { toast } from "sonner";

const DISMISSED_KEY = "push_prompt_dismissed";
// Delay in ms before showing the prompt after the user lands on a page
const PROMPT_DELAY_MS = 8000;

/**
 * Shows a soft in-app prompt after the user has been engaged for a few seconds.
 * Only fires the real browser permission dialog when the user explicitly clicks "Enable".
 * Never shown if already subscribed, already dismissed, or permission already decided.
 */
export function NotificationPrompt() {
    const { isSupported, permission, isSubscribed, subscribe } = usePushNotifications();
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Don't show if: not supported, already decided, already subscribed, or dismissed before
        if (!isSupported) return;
        if (permission !== "default") return;
        if (isSubscribed) return;
        if (sessionStorage.getItem(DISMISSED_KEY)) return;

        const timer = setTimeout(() => setVisible(true), PROMPT_DELAY_MS);
        return () => clearTimeout(timer);
    }, [isSupported, permission, isSubscribed]);

    if (!visible) return null;

    const handleEnable = async () => {
        setLoading(true);
        const ok = await subscribe();
        setLoading(false);
        setVisible(false);
        if (ok) {
            toast.success("You're all set! You'll now receive parish notifications.");
        } else if (Notification.permission === "denied") {
            toast.error("Notifications blocked. You can enable them in your browser settings.");
        }
        // If they clicked "Not now" in the browser dialog, just close silently
    };

    const handleDismiss = () => {
        sessionStorage.setItem(DISMISSED_KEY, "1");
        setVisible(false);
    };

    return (
        <div
            role="dialog"
            aria-label="Enable push notifications"
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm
                       bg-white border border-gray-200 rounded-xl shadow-lg p-4
                       animate-in slide-in-from-bottom-4 duration-300"
        >
            <button
                onClick={handleDismiss}
                aria-label="Dismiss notification prompt"
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
            >
                <X className="h-4 w-4" />
            </button>

            <div className="flex gap-3 items-start pr-4">
                <div className="bg-blue-100 rounded-full p-2 shrink-0">
                    <Bell className="h-5 w-5 text-blue-600" />
                </div>
                <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-900">Stay connected with your parish</p>
                    <p className="text-xs text-gray-500">
                        Get notified about new posts, messages, and parish events — even when the app is closed.
                    </p>
                </div>
            </div>

            <div className="flex gap-2 mt-3 justify-end">
                <Button variant="ghost" size="sm" onClick={handleDismiss} className="text-gray-500">
                    Not now
                </Button>
                <Button size="sm" onClick={handleEnable} disabled={loading}>
                    {loading ? "Enabling…" : "Enable notifications"}
                </Button>
            </div>
        </div>
    );
}
