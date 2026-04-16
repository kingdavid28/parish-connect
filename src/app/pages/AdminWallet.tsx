import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "../components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import {
    CheckCircle2, XCircle, Loader, ArrowDownCircle, ArrowUpCircle, RefreshCw,
    ImageIcon, ZoomIn, X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const API = "/parish-connect/api";
const getToken = () =>
    localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");

interface TopupRequest {
    id: string;
    user_id: string;
    user_name: string;
    user_email: string;
    user_avatar?: string;
    gcash_ref: string;
    gcash_sender: string;
    amount_php: number;
    gbless_amount: number;
    receipt_url?: string;
    created_at: string;
}

interface CashoutRequest {
    id: string;
    user_id: string;
    user_name: string;
    user_email: string;
    user_avatar?: string;
    gbless_amount: number;
    amount_php: number;
    gcash_number: string;
    gcash_name: string;
    created_at: string;
}

export default function AdminWallet() {
    const { isAdmin } = useAuth();
    const [topups, setTopups] = useState<TopupRequest[]>([]);
    const [cashouts, setCashouts] = useState<CashoutRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("topups");

    // Review dialog state
    const [reviewTarget, setReviewTarget] = useState<{ id: string; type: "topup" | "cashout"; label: string } | null>(null);
    const [reviewNote, setReviewNote] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // Receipt lightbox
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [t, c] = await Promise.all([
                fetch(`${API}/wallet/admin/topups`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()),
                fetch(`${API}/wallet/admin/cashouts`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()),
            ]);
            if (t.success) setTopups(t.data);
            if (c.success) setCashouts(c.data);
        } catch { toast.error("Failed to load requests"); }
        finally { setLoading(false); }
    };

    const openReview = (id: string, type: "topup" | "cashout", label: string) => {
        setReviewTarget({ id, type, label });
        setReviewNote("");
    };

    const handleDecision = async (decision: "approved" | "rejected") => {
        if (!reviewTarget) return;
        setSubmitting(true);
        try {
            const endpoint = reviewTarget.type === "topup"
                ? `${API}/wallet/admin/topup`
                : `${API}/wallet/admin/cashout`;

            const res = await fetch(endpoint, {
                method: "POST",
                headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
                body: JSON.stringify({ request_id: reviewTarget.id, decision, note: reviewNote }),
            });
            const data = await res.json();
            if (!data.success) { toast.error(data.message); return; }

            toast.success(`Request ${decision}`);
            setReviewTarget(null);
            fetchAll();
        } catch { toast.error("Failed to process request"); }
        finally { setSubmitting(false); }
    };

    if (!isAdmin) return null;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold">GBless Wallet Requests</h2>
                    <p className="text-sm text-gray-500">Review and approve top-up and cash-out requests</p>
                </div>
                <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                    <TabsTrigger value="topups">
                        <ArrowDownCircle className="h-4 w-4 mr-1.5" />
                        Top-ups
                        {topups.length > 0 && (
                            <span className="ml-1.5 bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5">{topups.length}</span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="cashouts">
                        <ArrowUpCircle className="h-4 w-4 mr-1.5" />
                        Cash-outs
                        {cashouts.length > 0 && (
                            <span className="ml-1.5 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5">{cashouts.length}</span>
                        )}
                    </TabsTrigger>
                </TabsList>

                {/* Top-up requests */}
                <TabsContent value="topups" className="mt-4">
                    {loading && <div className="flex justify-center py-8"><Loader className="h-5 w-5 animate-spin" /></div>}
                    {!loading && topups.length === 0 && (
                        <Card><CardContent className="py-10 text-center text-gray-400 text-sm">No pending top-up requests</CardContent></Card>
                    )}
                    <div className="space-y-3">
                        {topups.map(t => (
                            <Card key={t.id}>
                                <CardContent className="pt-4 pb-4">
                                    <div className="flex items-start gap-4">
                                        <Avatar className="h-10 w-10 shrink-0">
                                            <AvatarImage src={t.user_avatar} />
                                            <AvatarFallback>{t.user_name[0]}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-medium text-sm">{t.user_name}</p>
                                                <span className="text-xs text-gray-400">{t.user_email}</span>
                                            </div>
                                            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
                                                <span className="text-gray-500">Amount</span>
                                                <span className="font-semibold text-green-700">₱{parseFloat(String(t.amount_php)).toFixed(2)} → {Number(t.gbless_amount).toLocaleString()} GBless</span>
                                                <span className="text-gray-500">GCash Ref</span>
                                                <span className="font-mono font-medium">{t.gcash_ref}</span>
                                                <span className="text-gray-500">Sender</span>
                                                <span>{t.gcash_sender}</span>
                                                <span className="text-gray-500">Submitted</span>
                                                <span className="text-gray-400 text-xs">{formatDistanceToNow(new Date(t.created_at + "Z"), { addSuffix: true })}</span>
                                            </div>
                                            {/* Receipt screenshot */}
                                            {t.receipt_url ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setLightboxUrl(t.receipt_url!)}
                                                    className="mt-3 flex items-center gap-2 group"
                                                    title="View receipt"
                                                >
                                                    <img
                                                        src={t.receipt_url}
                                                        alt="GCash receipt"
                                                        className="h-16 w-16 rounded-lg border object-cover bg-gray-50 group-hover:opacity-80 transition-opacity"
                                                    />
                                                    <span className="flex items-center gap-1 text-xs text-blue-600 group-hover:underline">
                                                        <ZoomIn className="h-3.5 w-3.5" />View receipt
                                                    </span>
                                                </button>
                                            ) : (
                                                <p className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                                                    <ImageIcon className="h-3.5 w-3.5" />No receipt attached
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-2 shrink-0">
                                            <Button size="sm" className="bg-green-600 hover:bg-green-700"
                                                onClick={() => openReview(t.id, "topup", `₱${parseFloat(String(t.amount_php)).toFixed(2)} top-up for ${t.user_name}`)}>
                                                <CheckCircle2 className="h-4 w-4 mr-1" />Approve
                                            </Button>
                                            <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
                                                onClick={() => openReview(t.id, "topup", `₱${parseFloat(String(t.amount_php)).toFixed(2)} top-up for ${t.user_name}`)}>
                                                <XCircle className="h-4 w-4 mr-1" />Reject
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                {/* Cash-out requests */}
                <TabsContent value="cashouts" className="mt-4">
                    {loading && <div className="flex justify-center py-8"><Loader className="h-5 w-5 animate-spin" /></div>}
                    {!loading && cashouts.length === 0 && (
                        <Card><CardContent className="py-10 text-center text-gray-400 text-sm">No pending cash-out requests</CardContent></Card>
                    )}
                    <div className="space-y-3">
                        {cashouts.map(c => (
                            <Card key={c.id}>
                                <CardContent className="pt-4 pb-4">
                                    <div className="flex items-start gap-4">
                                        <Avatar className="h-10 w-10 shrink-0">
                                            <AvatarImage src={c.user_avatar} />
                                            <AvatarFallback>{c.user_name[0]}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-medium text-sm">{c.user_name}</p>
                                                <span className="text-xs text-gray-400">{c.user_email}</span>
                                            </div>
                                            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
                                                <span className="text-gray-500">Amount</span>
                                                <span className="font-semibold text-orange-700">{Number(c.gbless_amount).toLocaleString()} GBless → ₱{parseFloat(String(c.amount_php)).toFixed(2)}</span>
                                                <span className="text-gray-500">Send to GCash</span>
                                                <span className="font-mono font-medium">{c.gcash_number}</span>
                                                <span className="text-gray-500">Account Name</span>
                                                <span>{c.gcash_name}</span>
                                                <span className="text-gray-500">Submitted</span>
                                                <span className="text-gray-400 text-xs">{formatDistanceToNow(new Date(c.created_at + "Z"), { addSuffix: true })}</span>
                                            </div>
                                            <div className="mt-2 bg-orange-50 border border-orange-200 rounded px-3 py-2 text-xs text-orange-700">
                                                ⚠️ GBless has been reserved from user's balance. Send ₱{parseFloat(String(c.amount_php)).toFixed(2)} to <strong>{c.gcash_number}</strong> ({c.gcash_name}) before approving.
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2 shrink-0">
                                            <Button size="sm" className="bg-green-600 hover:bg-green-700"
                                                onClick={() => openReview(c.id, "cashout", `₱${parseFloat(String(c.amount_php)).toFixed(2)} cash-out for ${c.user_name}`)}>
                                                <CheckCircle2 className="h-4 w-4 mr-1" />Approve
                                            </Button>
                                            <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
                                                onClick={() => openReview(c.id, "cashout", `₱${parseFloat(String(c.amount_php)).toFixed(2)} cash-out for ${c.user_name}`)}>
                                                <XCircle className="h-4 w-4 mr-1" />Reject
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Review dialog */}
            <Dialog open={!!reviewTarget} onOpenChange={() => setReviewTarget(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Review Request</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-gray-600">{reviewTarget?.label}</p>
                    <div className="space-y-1.5">
                        <Label htmlFor="review-note">Note for user <span className="text-gray-400 font-normal">(optional)</span></Label>
                        <Input id="review-note" placeholder="e.g. Reference number verified"
                            value={reviewNote} onChange={e => setReviewNote(e.target.value)} />
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setReviewTarget(null)} disabled={submitting}>Cancel</Button>
                        <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => handleDecision("rejected")} disabled={submitting}>
                            {submitting ? <Loader className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
                            Reject
                        </Button>
                        <Button className="bg-green-600 hover:bg-green-700"
                            onClick={() => handleDecision("approved")} disabled={submitting}>
                            {submitting ? <Loader className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                            Approve
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Receipt lightbox */}
            {lightboxUrl && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setLightboxUrl(null)}
                >
                    <button
                        className="absolute top-4 right-4 text-white bg-white/20 rounded-full p-2 hover:bg-white/30"
                        onClick={() => setLightboxUrl(null)}
                        aria-label="Close"
                    >
                        <X className="h-5 w-5" />
                    </button>
                    <img
                        src={lightboxUrl}
                        alt="GCash receipt"
                        className="max-w-full max-h-[90vh] rounded-xl shadow-2xl object-contain"
                        onClick={e => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
}
