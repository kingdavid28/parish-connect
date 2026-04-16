import { useState, useEffect, useCallback } from "react";

const API_BASE = "/parish-connect/api";

function getToken(): string | null {
    return localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type PushPermission = "default" | "granted" | "denied";

export function usePushNotifications() {
    const [permission, setPermission] = useState<PushPermission>("default");
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSupported, setIsSupported] = useState(false);

    useEffect(() => {
        const supported =
            "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
        setIsSupported(supported);
        if (supported) {
            setPermission(Notification.permission as PushPermission);
            checkSubscription();
        }
    }, []);

    async function checkSubscription() {
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            setIsSubscribed(!!sub);
        } catch {
            setIsSubscribed(false);
        }
    }

    const subscribe = useCallback(async (): Promise<boolean> => {
        if (!isSupported) return false;
        setIsLoading(true);
        try {
            // 1. Request permission
            const result = await Notification.requestPermission();
            setPermission(result as PushPermission);
            if (result !== "granted") return false;

            // 2. Fetch VAPID public key
            const keyRes = await fetch(`${API_BASE}/push/vapid-key`);
            const keyData = await keyRes.json();
            if (!keyData.success) throw new Error("Could not fetch VAPID key");
            const publicKey = keyData.data.publicKey as string;

            // 3. Subscribe via PushManager
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey),
            });

            // 4. Send subscription to server
            const subJson = sub.toJSON();
            const res = await fetch(`${API_BASE}/push/subscribe`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${getToken()}`,
                },
                body: JSON.stringify({
                    endpoint: subJson.endpoint,
                    keys: subJson.keys,
                }),
            });

            if (!res.ok) throw new Error("Failed to save subscription");
            setIsSubscribed(true);
            return true;
        } catch (err) {
            console.error("Push subscribe error:", err);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [isSupported]);

    const unsubscribe = useCallback(async (): Promise<boolean> => {
        if (!isSupported) return false;
        setIsLoading(true);
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (!sub) {
                setIsSubscribed(false);
                return true;
            }

            // Remove from server first
            await fetch(`${API_BASE}/push/subscribe`, {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${getToken()}`,
                },
                body: JSON.stringify({ endpoint: sub.endpoint }),
            });

            await sub.unsubscribe();
            setIsSubscribed(false);
            return true;
        } catch (err) {
            console.error("Push unsubscribe error:", err);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [isSupported]);

    return { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe };
}
