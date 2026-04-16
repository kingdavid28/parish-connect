import { useState } from "react";
import { Button } from "./ui/button";
import { toast } from "sonner";

const API = "/parish-connect/api";
const getToken = () =>
    localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");

interface Props {
    receiverId: string;
    receiverName: string;
}

/**
 * One-tap kudos button. Rate-limited to once per receiver per day on the server.
 * Shows optimistic feedback immediately.
 */
export function KudosButton({ receiverId, receiverName }: Props) {
    const [loading, setLoading] = useState(false);
    const [given, setGiven] = useState(false);

    const handleGiveKudos = async () => {
        if (given || loading) return;
        setLoading(true);
        try {
            const res = await fetch(`${API}/rewards/${receiverId}/kudos`, {
                method: "POST",
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            const data = await res.json();
            if (res.status === 429) {
                toast.info(`You already gave kudos to ${receiverName} today`);
                setGiven(true);
                return;
            }
            if (!data.success) {
                toast.error(data.message || "Failed to give kudos");
                return;
            }
            setGiven(true);
            toast.success(`💛 Kudos sent to ${receiverName}!`);
        } catch {
            toast.error("Failed to give kudos");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button
            variant={given ? "secondary" : "outline"}
            size="sm"
            onClick={handleGiveKudos}
            disabled={loading || given}
            className={given ? "text-yellow-600 border-yellow-300 bg-yellow-50" : ""}
        >
            {loading ? "…" : given ? "💛 Kudos Given" : "💛 Give Kudos"}
        </Button>
    );
}
