import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "../components/ui/avatar";
import {
    Wallet as WalletIcon, ArrowDownCircle, ArrowUpCircle, Gift,
    Loader, Zap, Clock, CheckCircle2, XCircle, Info, ImageIcon, X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const API = "/parish-connect/api";
const getToken = () =>
    localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");

interface WalletSummary {
    balance: number;
    balance_php: number;
    cashout_min: number;
    cashout_min_php: number;
    gbless_per_php: number;
    pending_topups: number;
    pending_cashouts: number;
    can_cashout: boolean;
}

interface GcashInfo {
    gcash_number: string;
    gcash_name: string;
    gcash_qr_url: string;
    rate_label: string;
    note: string;
}

interface TxRow {
    action: string;
    points: number;
    ref_name: string | null;
    created_at: string;
}

interface TopupRow {
    id: string;
    gcash_ref: string;
    amount_php: number;
    gbless_amount: number;
    status: "pending" | "approved" | "rejected";
    admin_note: string | null;
    created_at: string;
}

interface CashoutRow {
    id: string;
    gbless_amount: number;
    amount_php: number;
    gcash_number: string;
    status: "pending" | "approved" | "rejected";
    admin_note: string | null;
    created_at: string;
}

interface UserOption { id: string; name: string; avatar?: string; }

const TX_LABELS: Record<string, string> = {
    post_created: "Published a post",
    comment_added: "Left a comment",
    like_received: "Received a like",
    kudos_received: "Received kudos",
    follow_received: "Gained a follower",
    daily_login: "Daily login",
    topup_approved: "GCash top-up",
    gift_received: "Gift received",
    gift_sent: "Gift sent",
    cashout_reserved: "Cash-out (reserved)",
    cashout_refunded: "Cash-out refunded",
};

const TX_ICONS: Record<string, string> = {
    post_created: "✍️", comment_added: "💬", like_received: "❤️",
    kudos_received: "💛", follow_received: "🤝", daily_login: "☀️",
    topup_approved: "💰", gift_received: "🎁", gift_sent: "🎁",
    cashout_reserved: "💸", cashout_refunded: "↩️",
};

function StatusBadge({ status }: { status: string }) {
    if (status === "approved") return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
    if (status === "rejected") return <Badge className="bg-red-100 text-red-700 border-red-200"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
    return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
}

export default function Wallet() {
    const { user } = useAuth();
    const [summary, setSummary] = useState<WalletSummary | null>(null);
    const [gcashInfo, setGcashInfo] = useState<GcashInfo | null>(null);
    const [history, setHistory] = useState<{ transactions: TxRow[]; topups: TopupRow[]; cashouts: CashoutRow[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("balance");

    // Top-up form
    const [topupRef, setTopupRef] = useState("");
    const [topupSender, setTopupSender] = useState("");
    const [topupAmount, setTopupAmount] = useState("");
    const [topupReceipt, setTopupReceipt] = useState<File | null>(null);
    const [topupReceiptPreview, setTopupReceiptPreview] = useState<string | null>(null);
    const [submittingTopup, setSubmittingTopup] = useState(false);
    const receiptInputRef = React.useRef<HTMLInputElement>(null);

    // Cash-out form
    const [cashoutAmount, setCashoutAmount] = useState("");
    const [cashoutNumber, setCashoutNumber] = useState("");
    const [cashoutName, setCashoutName] = useState("");
    const [submittingCashout, setSubmittingCashout] = useState(false);

    // Gift form
    const [giftSearch, setGiftSearch] = useState("");
    const [giftResults, setGiftResults] = useState<UserOption[]>([]);
    const [giftRecipient, setGiftRecipient] = useState<UserOption | null>(null);
    const [giftAmount, setGiftAmount] = useState("");
    const [giftMessage, setGiftMessage] = useState("");
    const [submittingGift, setSubmittingGift] = useState(false);
    const [searchingUsers, setSearchingUsers] = useState(false);

    useEffect(() => {
        Promise.all([fetchSummary(), fetchGcashInfo()]).finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (tab === "history" && !history) fetchHistory();
    }, [tab]);

    const fetchSummary = async () => {
        const res = await fetch(`${API}/wallet`, { headers: { Authorization: `Bearer ${getToken()}` } });
        const data = await res.json();
        if (data.success) setSummary(data.data);
    };

    const fetchGcashInfo = async () => {
        const res = await fetch(`${API}/wallet/gcash-info`, { headers: { Authorization: `Bearer ${getToken()}` } });
        const data = await res.json();
        if (data.success) setGcashInfo(data.data);
    };

    const fetchHistory = async () => {
        const res = await fetch(`${API}/wallet/history`, { headers: { Authorization: `Bearer ${getToken()}` } });
        const data = await res.json();
        if (data.success) setHistory(data.data);
    };

    const handleTopup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!topupRef.trim() || !topupSender.trim() || !topupAmount) return;
        setSubmittingTopup(true);
        try {
            const formData = new FormData();
            formData.append("gcash_ref", topupRef);
            formData.append("gcash_sender", topupSender);
            formData.append("amount_php", topupAmount);
            if (topupReceipt) formData.append("receipt", topupReceipt);

            const res = await fetch(`${API}/wallet/topup`, {
                method: "POST",
                headers: { Authorization: `Bearer ${getToken()}` },
                body: formData,
            });
            const data = await res.json();
            if (!data.success) { toast.error(data.message); return; }
            toast.success(data.message);
            setTopupRef(""); setTopupSender(""); setTopupAmount("");
            setTopupReceipt(null); setTopupReceiptPreview(null);
            if (receiptInputRef.current) receiptInputRef.current.value = "";
            fetchSummary();
        } catch { toast.error("Failed to submit top-up"); }
        finally { setSubmittingTopup(false); }
    };

    const handleReceiptSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { toast.error("Receipt image too large. Max 5MB."); return; }
        setTopupReceipt(file);
        const reader = new FileReader();
        reader.onload = ev => setTopupReceiptPreview(ev.target?.result as string);
        reader.readAsDataURL(file);
    };

    const handleCashout = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cashoutAmount || !cashoutNumber || !cashoutName) return;
        setSubmittingCashout(true);
        try {
            const res = await fetch(`${API}/wallet/cashout`, {
                method: "POST",
                headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
                body: JSON.stringify({ gbless_amount: parseInt(cashoutAmount), gcash_number: cashoutNumber, gcash_name: cashoutName }),
            });
            const data = await res.json();
            if (!data.success) { toast.error(data.message); return; }
            toast.success(data.message);
            setCashoutAmount(""); setCashoutNumber(""); setCashoutName("");
            fetchSummary();
        } catch { toast.error("Failed to submit cash-out"); }
        finally { setSubmittingCashout(false); }
    };

    const searchUsers = async (q: string) => {
        if (q.length < 2) { setGiftResults([]); return; }
        setSearchingUsers(true);
        try {
            const res = await fetch(`${API}/users?search=${encodeURIComponent(q)}`, {
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            const data = await res.json();
            if (data.success) {
                setGiftResults((data.data || []).filter((u: UserOption) => u.id !== user?.id).slice(0, 6));
            }
        } catch { /* ignore */ }
        finally { setSearchingUsers(false); }
    };

    const handleGift = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!giftRecipient || !giftAmount) return;
        setSubmittingGift(true);
        try {
            const res = await fetch(`${API}/wallet/gift`, {
                method: "POST",
                headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
                body: JSON.stringify({ receiver_id: giftRecipient.id, gbless_amount: parseInt(giftAmount), message: giftMessage }),
            });
            const data = await res.json();
            if (!data.success) { toast.error(data.message); return; }
            toast.success(data.message);
            setGiftRecipient(null); setGiftAmount(""); setGiftMessage(""); setGiftSearch(""); setGiftResults([]);
            fetchSummary();
        } catch { toast.error("Failed to send gift"); }
        finally { setSubmittingGift(false); }
    };

    if (loading) return (
        <div className="flex justify-center items-center min-h-[60vh]">
            <Loader className="h-6 w-6 animate-spin" />
        </div>
    );

    const phpEquiv = summary ? (parseFloat(cashoutAmount || "0") / summary.gbless_per_php).toFixed(2) : "0.00";

    return (
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="bg-green-600 p-2 rounded-lg">
                    <WalletIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-semibold">GBless Wallet</h1>
                    <p className="text-sm text-gray-500">Buy, gift, and cash out GBless Points</p>
                </div>
            </div>

            {/* Balance card */}
            <Card className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-white border-0">
                <CardContent className="pt-6 pb-5">
                    <p className="text-sm font-medium opacity-80 mb-1">Your Balance</p>
                    <div className="flex items-end gap-2">
                        <p className="text-4xl font-bold">{(summary?.balance ?? 0).toLocaleString()}</p>
                        <p className="text-lg font-medium opacity-80 mb-0.5">GBless</p>
                    </div>
                    <p className="text-sm opacity-70 mt-1">≈ ₱{summary?.balance_php.toFixed(2) ?? "0.00"} PHP</p>
                    {(summary?.pending_topups ?? 0) > 0 && (
                        <p className="text-xs mt-2 bg-white/20 rounded px-2 py-1 inline-block">
                            {summary!.pending_topups} top-up request{summary!.pending_topups > 1 ? "s" : ""} pending review
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Rate info */}
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-700">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Exchange rate: <strong>₱1 = {(summary?.gbless_per_php ?? 10000).toLocaleString()} GBless</strong> · Cash-out minimum: <strong>{(summary?.cashout_min ?? 1000000).toLocaleString()} GBless (₱{summary?.cashout_min_php ?? 100})</strong></span>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="balance"><ArrowDownCircle className="h-4 w-4 mr-1" />Buy</TabsTrigger>
                    <TabsTrigger value="gift"><Gift className="h-4 w-4 mr-1" />Gift</TabsTrigger>
                    <TabsTrigger value="cashout"><ArrowUpCircle className="h-4 w-4 mr-1" />Cash Out</TabsTrigger>
                    <TabsTrigger value="history"><Clock className="h-4 w-4 mr-1" />History</TabsTrigger>
                </TabsList>

                {/* ── BUY TAB ── */}
                <TabsContent value="balance" className="mt-4 space-y-4">
                    {gcashInfo && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">Step 1 — Send GCash to the parish</CardTitle>
                                <CardDescription>{gcashInfo.note}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex flex-col sm:flex-row gap-4 items-center">
                                    {gcashInfo.gcash_qr_url && (
                                        <img src={gcashInfo.gcash_qr_url} alt="GCash QR" className="w-40 h-40 rounded-xl border object-contain bg-white" />
                                    )}
                                    <div className="space-y-2 text-sm">
                                        <div>
                                            <p className="text-gray-500">GCash Number</p>
                                            <p className="text-xl font-bold tracking-widest">{gcashInfo.gcash_number}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500">Account Name</p>
                                            <p className="font-semibold">{gcashInfo.gcash_name}</p>
                                        </div>
                                        <div className="bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
                                            <p className="font-medium text-yellow-700">{gcashInfo.rate_label}</p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Step 2 — Submit your reference number</CardTitle>
                            <CardDescription>After sending, fill in the details below. Admin will credit your GBless within 24 hours.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleTopup} className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="topup-amount">Amount Sent (₱)</Label>
                                    <Input id="topup-amount" type="number" min="1" max="10000" step="0.01"
                                        placeholder="e.g. 100" value={topupAmount} onChange={e => setTopupAmount(e.target.value)} required />
                                    {topupAmount && (
                                        <p className="text-xs text-yellow-600">= {(parseFloat(topupAmount || "0") * (summary?.gbless_per_php ?? 10000)).toLocaleString()} GBless</p>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="topup-ref">GCash Reference Number</Label>
                                    <Input id="topup-ref" placeholder="e.g. 1234567890" value={topupRef}
                                        onChange={e => setTopupRef(e.target.value)} required />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="topup-sender">Your GCash Name / Number</Label>
                                    <Input id="topup-sender" placeholder="e.g. Juan dela Cruz / 09XXXXXXXXX"
                                        value={topupSender} onChange={e => setTopupSender(e.target.value)} required />
                                </div>

                                {/* Receipt screenshot upload */}
                                <div className="space-y-1.5">
                                    <Label>
                                        GCash Receipt Screenshot
                                        <span className="text-gray-400 font-normal ml-1">(recommended)</span>
                                    </Label>
                                    <input
                                        ref={receiptInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        className="hidden"
                                        onChange={handleReceiptSelect}
                                    />
                                    {topupReceiptPreview ? (
                                        <div className="relative inline-block">
                                            <img
                                                src={topupReceiptPreview}
                                                alt="Receipt preview"
                                                className="max-h-48 rounded-lg border object-contain bg-gray-50"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => { setTopupReceipt(null); setTopupReceiptPreview(null); if (receiptInputRef.current) receiptInputRef.current.value = ""; }}
                                                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                                                aria-label="Remove receipt"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => receiptInputRef.current?.click()}
                                            className="flex items-center gap-2 w-full border-2 border-dashed border-gray-200 rounded-lg px-4 py-4 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
                                        >
                                            <ImageIcon className="h-5 w-5" />
                                            Tap to attach your GCash receipt screenshot
                                        </button>
                                    )}
                                    <p className="text-xs text-gray-400">Attaching a screenshot speeds up admin verification. Max 5MB.</p>
                                </div>

                                <Button type="submit" className="w-full" disabled={submittingTopup}>
                                    {submittingTopup ? <Loader className="h-4 w-4 animate-spin mr-2" /> : <ArrowDownCircle className="h-4 w-4 mr-2" />}
                                    Submit Top-up Request
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── GIFT TAB ── */}
                <TabsContent value="gift" className="mt-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Send GBless to a parishioner</CardTitle>
                            <CardDescription>Minimum gift: 100 GBless. The amount is deducted from your balance immediately.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleGift} className="space-y-4">
                                {/* Recipient search */}
                                <div className="space-y-1.5">
                                    <Label>Recipient</Label>
                                    {giftRecipient ? (
                                        <div className="flex items-center gap-3 border rounded-lg px-3 py-2">
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={giftRecipient.avatar} />
                                                <AvatarFallback>{giftRecipient.name[0]}</AvatarFallback>
                                            </Avatar>
                                            <span className="flex-1 text-sm font-medium">{giftRecipient.name}</span>
                                            <Button type="button" variant="ghost" size="sm" onClick={() => setGiftRecipient(null)}>Change</Button>
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <Input placeholder="Search by name…" value={giftSearch}
                                                onChange={e => { setGiftSearch(e.target.value); searchUsers(e.target.value); }} />
                                            {searchingUsers && <Loader className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-gray-400" />}
                                            {giftResults.length > 0 && (
                                                <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg overflow-hidden">
                                                    {giftResults.map(u => (
                                                        <button key={u.id} type="button"
                                                            className="flex items-center gap-3 w-full px-3 py-2 hover:bg-gray-50 text-left"
                                                            onClick={() => { setGiftRecipient(u); setGiftSearch(""); setGiftResults([]); }}>
                                                            <Avatar className="h-7 w-7">
                                                                <AvatarImage src={u.avatar} />
                                                                <AvatarFallback>{u.name[0]}</AvatarFallback>
                                                            </Avatar>
                                                            <span className="text-sm">{u.name}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="gift-amount">GBless Amount</Label>
                                    <Input id="gift-amount" type="number" min="100" step="100"
                                        placeholder="e.g. 1000" value={giftAmount} onChange={e => setGiftAmount(e.target.value)} required />
                                    {giftAmount && summary && (
                                        <p className="text-xs text-gray-500">≈ ₱{(parseInt(giftAmount || "0") / summary.gbless_per_php).toFixed(2)} · Balance after: {Math.max(0, summary.balance - parseInt(giftAmount || "0")).toLocaleString()} GBless</p>
                                    )}
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="gift-msg">Message <span className="text-gray-400 font-normal">(optional)</span></Label>
                                    <Input id="gift-msg" placeholder="e.g. God bless you!" maxLength={255}
                                        value={giftMessage} onChange={e => setGiftMessage(e.target.value)} />
                                </div>

                                <Button type="submit" className="w-full" disabled={submittingGift || !giftRecipient}>
                                    {submittingGift ? <Loader className="h-4 w-4 animate-spin mr-2" /> : <Gift className="h-4 w-4 mr-2" />}
                                    Send Gift
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── CASH OUT TAB ── */}
                <TabsContent value="cashout" className="mt-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Cash Out GBless</CardTitle>
                            <CardDescription>
                                Minimum: {(summary?.cashout_min ?? 1000000).toLocaleString()} GBless = ₱{summary?.cashout_min_php ?? 100}.
                                Admin will send to your GCash within 24–48 hours after approval.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!summary?.can_cashout && (
                                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700 mb-4">
                                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>You need at least <strong>{(summary?.cashout_min ?? 1000000).toLocaleString()} GBless</strong> to cash out. Keep earning!</span>
                                </div>
                            )}
                            <form onSubmit={handleCashout} className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="co-amount">GBless to Cash Out</Label>
                                    <Input id="co-amount" type="number" min={summary?.cashout_min ?? 1000000}
                                        step={summary?.cashout_min ?? 1000000} placeholder={`Min. ${(summary?.cashout_min ?? 1000000).toLocaleString()}`}
                                        value={cashoutAmount} onChange={e => setCashoutAmount(e.target.value)}
                                        disabled={!summary?.can_cashout} required />
                                    {cashoutAmount && (
                                        <p className="text-xs text-green-600 font-medium">= ₱{phpEquiv} PHP</p>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="co-number">Your GCash Number</Label>
                                    <Input id="co-number" placeholder="09XXXXXXXXX" value={cashoutNumber}
                                        onChange={e => setCashoutNumber(e.target.value)} disabled={!summary?.can_cashout} required />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="co-name">GCash Registered Name</Label>
                                    <Input id="co-name" placeholder="Full name as registered in GCash"
                                        value={cashoutName} onChange={e => setCashoutName(e.target.value)}
                                        disabled={!summary?.can_cashout} required />
                                </div>
                                <Button type="submit" className="w-full" disabled={submittingCashout || !summary?.can_cashout}>
                                    {submittingCashout ? <Loader className="h-4 w-4 animate-spin mr-2" /> : <ArrowUpCircle className="h-4 w-4 mr-2" />}
                                    Request Cash Out
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── HISTORY TAB ── */}
                <TabsContent value="history" className="mt-4 space-y-4">
                    {!history && <div className="flex justify-center py-8"><Loader className="h-5 w-5 animate-spin" /></div>}

                    {history && (
                        <>
                            {/* Top-up requests */}
                            {history.topups.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">Top-up Requests</h3>
                                    <div className="space-y-2">
                                        {history.topups.map(t => (
                                            <div key={t.id} className="flex items-center justify-between border rounded-lg px-4 py-3 bg-white">
                                                <div>
                                                    <p className="text-sm font-medium">₱{parseFloat(String(t.amount_php)).toFixed(2)} → {Number(t.gbless_amount).toLocaleString()} GBless</p>
                                                    <p className="text-xs text-gray-400">Ref: {t.gcash_ref} · {formatDistanceToNow(new Date(t.created_at + "Z"), { addSuffix: true })}</p>
                                                    {t.admin_note && <p className="text-xs text-gray-500 mt-0.5">Note: {t.admin_note}</p>}
                                                </div>
                                                <StatusBadge status={t.status} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Cash-out requests */}
                            {history.cashouts.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">Cash-out Requests</h3>
                                    <div className="space-y-2">
                                        {history.cashouts.map(c => (
                                            <div key={c.id} className="flex items-center justify-between border rounded-lg px-4 py-3 bg-white">
                                                <div>
                                                    <p className="text-sm font-medium">{Number(c.gbless_amount).toLocaleString()} GBless → ₱{parseFloat(String(c.amount_php)).toFixed(2)}</p>
                                                    <p className="text-xs text-gray-400">To: {c.gcash_number} · {formatDistanceToNow(new Date(c.created_at + "Z"), { addSuffix: true })}</p>
                                                    {c.admin_note && <p className="text-xs text-gray-500 mt-0.5">Note: {c.admin_note}</p>}
                                                </div>
                                                <StatusBadge status={c.status} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Transaction log */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">All Transactions</h3>
                                {history.transactions.length === 0 && (
                                    <p className="text-sm text-gray-400 text-center py-6">No transactions yet.</p>
                                )}
                                <div className="space-y-2">
                                    {history.transactions.map((tx, i) => (
                                        <div key={i} className="flex items-center justify-between border rounded-lg px-4 py-3 bg-white">
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg">{TX_ICONS[tx.action] ?? "⚡"}</span>
                                                <div>
                                                    <p className="text-sm font-medium">{TX_LABELS[tx.action] ?? tx.action}</p>
                                                    {tx.ref_name && <p className="text-xs text-gray-400">{tx.ref_name}</p>}
                                                    <p className="text-xs text-gray-400">{formatDistanceToNow(new Date(tx.created_at + "Z"), { addSuffix: true })}</p>
                                                </div>
                                            </div>
                                            <span className={`text-sm font-semibold ${tx.points >= 0 ? "text-green-600" : "text-red-500"}`}>
                                                {tx.points >= 0 ? "+" : ""}{tx.points.toLocaleString()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
