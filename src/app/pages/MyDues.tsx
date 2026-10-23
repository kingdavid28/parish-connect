import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Loader2, PhilippinePeso, Plus } from "lucide-react";
import { toast } from "sonner";
import { API } from "../config";
import ImageLightbox from "../components/ImageLightbox";
import GcashPaymentDetails from "../components/GcashPaymentDetails";

const MONTHS_FULL = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];
const getToken = () =>
  localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");

interface Payment {
  id: string; month: number; amount: number; method: string;
  reference: string | null; receipt_url: string | null;
  status: "confirmed" | "pending" | "rejected" | "voided"; created_at: string;
  voided_at: string | null; void_reason: string | null;
}
interface LedgerMonth {
  month: number; expected: number; paid_total: number; pending_total: number;
  balance: number; status: "unpaid" | "partial" | "paid"; payments: Payment[];
}
interface MyLedger {
  donor: { id: string; name: string; bec_name: string | null } | null;
  year: number; expected: number; months: LedgerMonth[];
  annual_expected: number; annual_paid: number; net_balance: number; total_pending: number;
}
interface GcashInfo {
  gcash_number: string;
  gcash_name: string;
  gcash_qr_url: string;
}

const peso = (n: number) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-green-100 text-green-800",
  partial: "bg-amber-100 text-amber-800",
  unpaid: "bg-gray-100 text-gray-500",
};
const STATUS_LABEL: Record<string, string> = {
  paid: "complete",
  partial: "partial",
  unpaid: "not yet",
};

export default function MyDues() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [ledger, setLedger] = useState<MyLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [gcashInfo, setGcashInfo] = useState<GcashInfo | null>(null);
  const [loadingGcashInfo, setLoadingGcashInfo] = useState(true);
  const [gcashInfoError, setGcashInfoError] = useState<string | null>(null);
  // Donation form
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);
  const [reportAmount, setReportAmount] = useState("");
  const [reportRef, setReportRef] = useState("");
  const [reportSender, setReportSender] = useState("");
  const [reportReceipt, setReportReceipt] = useState<File | null>(null);
  const [reporting, setReporting] = useState(false);

  const fetchLedger = useCallback(async () => {
    setLoading(true);
    setLedgerError(null);
    try {
      const res = await fetch(`${API}/finance/my/ledger?year=${year}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load your ledger");
      if (data.success) setLedger(data.data);
    } catch (e: any) {
      setLedgerError(e.message);
      setLedger(null);
    } finally {
      setLoading(false);
    }
  }, [year]);

  const fetchGcashInfo = useCallback(async () => {
    setLoadingGcashInfo(true);
    setGcashInfoError(null);
    try {
      const res = await fetch(`${API}/wallet/gcash-info`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Unable to load parish GCash details");
      }
      setGcashInfo(data.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load parish GCash details";
      setGcashInfoError(message);
    } finally {
      setLoadingGcashInfo(false);
    }
  }, []);

  useEffect(() => {
    void fetchLedger();
    void fetchGcashInfo();
  }, [fetchLedger, fetchGcashInfo]);

  const submitReport = async () => {
    const amount = Number.parseFloat(reportAmount);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error("Enter a valid amount"); return; }
    if (!reportRef.trim()) { toast.error("GCash reference number is required"); return; }
    if (!reportSender.trim()) { toast.error("GCash sender name or number is required"); return; }
    setReporting(true);
    try {
      const fd = new FormData();
      fd.append("year", String(year));
      fd.append("month", String(reportMonth));
      fd.append("amount", String(amount));
      fd.append("method", "gcash");
      fd.append("gcash_ref", reportRef.trim());
      fd.append("gcash_sender", reportSender.trim());
      if (reportReceipt) fd.append("receipt", reportReceipt);
      const res = await fetch(`${API}/finance/my/contributions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to submit contribution");
      toast.success("Contribution submitted. 10 GBless will be rewarded after admin approval.");
      setReportOpen(false);
      setReportAmount(""); setReportRef(""); setReportSender(""); setReportReceipt(null);
      void fetchLedger();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReporting(false);
    }
  };

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const totalPaid = ledger?.months.reduce((s, m) => s + m.paid_total, 0) || 0;
  const totalPending = ledger?.total_pending ?? 0;
  const annualExpected = ledger?.annual_expected ?? 0;
  const annualPaid = ledger?.annual_paid ?? 0;
  const netBalance = ledger?.net_balance ?? 0;
  const annualPct = annualExpected > 0 ? Math.min(100, Math.round((annualPaid / annualExpected) * 100)) : 0;

  const hasReports = (ledger?.months || []).some((m) => m.payments.length > 0);
  const becPart = ledger?.donor?.bec_name ? " · " + ledger.donor.bec_name : "";
  const donorLabel = ledger?.donor ? ledger.donor.name + becPart : "Your donations";

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      );
    }
    if (ledgerError) {
      return (
        <div className="text-center py-8 space-y-2 text-red-600">
          <p className="font-medium">Unable to load your contributions.</p>
          <p className="text-sm">{ledgerError}</p>
          <Button variant="outline" size="sm" onClick={() => { setLedgerError(null); void fetchLedger(); }}>
            Try again
          </Button>
        </div>
      );
    }
    if (!ledger?.donor && !hasReports) {
      return (
        <div className="text-center py-8 space-y-2">
          <p className="text-gray-600 font-medium">No donor record linked yet.</p>
          <p className="text-sm text-gray-500">
            Donated via GCash? Tap <strong>Donate</strong> above to submit your transfer details. An admin will match the donation to your record.
          </p>
        </div>
      );
    }
    return (
      <>
        {!ledger?.donor && (
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 mb-4 text-xs text-blue-700">
            Awaiting admin review — your submitted donations appear below. An admin will link your donor record when the donation is approved.
          </div>
        )}
        <p className="text-sm text-gray-600 mb-4">
          {donorLabel}
          {ledger!.expected > 0 && ` · suggested ${peso(ledger!.expected)}/month`}
        </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-gray-500">Paid (confirmed)</p>
                  <p className="text-lg font-semibold text-green-700">{peso(totalPaid)}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-gray-500">Awaiting approval</p>
                  <p className="text-lg font-semibold text-amber-600">{peso(totalPending)}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-gray-500">Expected this year</p>
                  <p className="text-lg font-semibold">{peso(annualExpected)}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-gray-500">Net balance</p>
                  <p className={`text-lg font-semibold ${netBalance > 0 ? "text-amber-600" : "text-green-700"}`}>{peso(netBalance)}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-gray-500">Annual progress</p>
                  <p className="text-lg font-semibold">{annualPct}%</p>
                </div>
              </div>
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Annual goal</span>
                  <span>{peso(annualPaid)} / {peso(annualExpected)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div className={`bg-green-600 h-2.5 rounded-full`} style={{ width: `${annualPct}%` }}></div>
                </div>
              </div>
              <div className="space-y-2">
                {(ledger?.months ?? []).filter((m) => ledger?.donor || m.payments.length > 0).map((m) => (
                  <div key={m.month} className="border rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{MONTHS_FULL[m.month - 1]}</p>
                        <p className="text-xs text-gray-500">
                          {m.expected > 0 ? `suggested ${peso(m.expected)}` : "no suggested amount"}
                          {m.status !== "unpaid" && ` · given ${peso(m.paid_total)}`}
                          {m.status === "partial" && ` · ${peso(m.balance)} to go`}
                          {m.pending_total > 0 && ` · ${peso(m.pending_total)} awaiting approval`}
                        </p>
                      </div>
                      <Badge className={`${STATUS_STYLE[m.status]} border-0`}>{STATUS_LABEL[m.status]}</Badge>
                    </div>
                    {m.payments.length > 0 && (
                      <div className="mt-2 space-y-1 border-t pt-2">
                        {m.payments.map((p) => (
                          <div key={p.id} className="flex justify-between items-center text-sm">
                            <span className="text-gray-600 capitalize">
                              {p.method}{p.reference ? ` · ${p.reference}` : ""}
                              {p.receipt_url && (
                                <> · <button type="button" className="text-primary hover:underline"
                                  onClick={() => setLightboxUrl(p.receipt_url!)}>receipt</button></>
                              )}
                              {p.status === "pending" && (
                                <Badge className="ml-1.5 bg-amber-100 text-amber-800 border-0 text-xs">pending</Badge>
                              )}
                              {p.status === "rejected" && (
                                <Badge className="ml-1.5 bg-red-100 text-red-800 border-0 text-xs">rejected</Badge>
                              )}
                              {p.status === "voided" && (
                                <Badge className="ml-1.5 bg-gray-100 text-gray-700 border-0 text-xs">voided</Badge>
                              )}
                            </span>
                            <span className={`font-medium ${(p.status === "rejected" || p.status === "voided") ? "line-through text-gray-400" : ""}`}>
                              {peso(p.amount)}
                            </span>
                            {p.status === "voided" && p.void_reason && (
                              <span className="ml-2 text-xs text-gray-500 italic">void: {p.void_reason}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
    );
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <PhilippinePeso className="h-5 w-5 text-primary" />
              Balik Pasalamat sa Diyos
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => setReportOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Donate
              </Button>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-[95px] h-9" aria-label="Year"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>{renderContent()}</CardContent>
      </Card>

      {/* Donation dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Donate to Balik Pasalamat sa Diyos</DialogTitle>
            <DialogDescription>
              Donations are voluntary. Send your chosen amount to the parish GCash account below, then submit the transfer details. The donation amount is not converted to wallet GBless; receive 10 GBless only after an admin verifies and approves the donation.
            </DialogDescription>
          </DialogHeader>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Step 1 — Send GCash to the parish</CardTitle>
              <p className="text-sm text-muted-foreground">
                Send your chosen contribution amount. Admin will verify the transfer before recording it.
              </p>
            </CardHeader>
            <CardContent>
              {loadingGcashInfo ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading parish GCash details…
                </div>
              ) : gcashInfoError ? (
                <div className="space-y-2 text-sm text-red-600">
                  <p>{gcashInfoError}</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => { void fetchGcashInfo(); }}>
                    Try again
                  </Button>
                </div>
              ) : gcashInfo ? (
                <GcashPaymentDetails
                  number={gcashInfo.gcash_number}
                  name={gcashInfo.gcash_name}
                  qrUrl={gcashInfo.gcash_qr_url}
                  onShowQr={() => setLightboxUrl(gcashInfo.gcash_qr_url)}
                />
              ) : null}
            </CardContent>
          </Card>
          <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-medium">GBless reward</p>
            <p>Once approved, this contribution earns 10 GBless. The contribution amount itself is not added to your GBless wallet.</p>
          </div>
          <div className="text-sm font-semibold">Step 2 — Submit your transfer details</div>
          <form onSubmit={(e) => { e.preventDefault(); void submitReport(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="r-month">Month <span className="text-red-500">*</span></Label>
                <Select value={String(reportMonth)} onValueChange={(v) => setReportMonth(Number(v))}>
                  <SelectTrigger id="r-month"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS_FULL.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-amount">Amount (₱) <span className="text-red-500">*</span></Label>
                <Input id="r-amount" type="number" min="0.01" step="0.01" required autoFocus
                  value={reportAmount} onChange={(e) => setReportAmount(e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-ref">GCash Reference Number <span className="text-red-500">*</span></Label>
              <Input id="r-ref" value={reportRef} placeholder="e.g. 1234567890" required maxLength={100}
                onChange={(e) => setReportRef(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-sender">Your GCash Name / Number <span className="text-red-500">*</span></Label>
              <Input id="r-sender" value={reportSender} placeholder="Name or number registered with GCash"
                required maxLength={100} onChange={(e) => setReportSender(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-receipt">Receipt Screenshot (optional)</Label>
              <Input id="r-receipt" type="file" accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (file && file.size > 5 * 1024 * 1024) {
                    toast.error("Receipt image too large. Maximum size is 5MB.");
                    e.target.value = "";
                    setReportReceipt(null);
                    return;
                  }
                  setReportReceipt(file);
                }} />
              <p className="text-xs text-gray-500">A receipt speeds up admin verification. Maximum 5MB.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={reporting || loadingGcashInfo || !!gcashInfoError || !gcashInfo}>
                {reporting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Submit Contribution
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ImageLightbox src={lightboxUrl} alt="Payment receipt" onClose={() => setLightboxUrl(null)} />
    </div>
  );
}
