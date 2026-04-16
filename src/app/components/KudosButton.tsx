import { useState } from "react";
import { Button } from "./ui/button";
import { toast } from "sonner";

const API = "/parish-connect/api";
const PRAISE_COST = 15; // must match POINTS['kudos_received'] in rewards.php

const getToken = () =>
    localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");

interface Props {
    receiverId: string;
    receiverName: string;
}

/**
 * Praise button — costs PRAISE_COST GBless from the giver, awards the same to the receiver.
 * Rate-limited to once per receiver per day on the server.
 * API endpoint remains /kudos for backward compatibility with existing DB records.
 */
export function KudosButton({ receiverId, receiverName }: Props) {
    const [loading, setLoading] = useState(false);
    const [given, setGiven] = useState(false);

    const handleGivePraise = async () => {
        if (given || loading) return;
        setLoading(true);
        try {
            const res = await fetch(`${API}/rewards/${receiverId}/kudos`, {
                method: "POST",
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            const data = await res.json();

            if (res.status === 429) {
                toast.info(`You already praised ${receiverName} today`);
                setGiven(true);
                return;
            }

            if (!data.success) {
                if (data.code === "insufficient_balance") {
                    toast.error(`Not enough GBless. You need ${PRAISE_COST} GBless to give praise.`);
                } else {
                    toast.error(data.message || "Failed to give praise");
                }
                return;
            }

            setGiven(true);
            toast.success(`💛 ${data.message}`);
        } catch {
            toast.error("Failed to give praise");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button
            variant={given ? "secondary" : "outline"}
            size="sm"
            onClick={handleGivePraise}
            disabled={loading || given}
            className={given ? "text-yellow-600 border-yellow-300 bg-yellow-50" : ""}
            title={given ? "Praise given" : `Give praise (costs ${PRAISE_COST} GBless)`}
        >
            {loading ? "…" : given ? "💛 Praised" : `💛 Praise (${PRAISE_COST})`}
        </Button>
    );
}
