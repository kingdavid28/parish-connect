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

const MONTHS_FULL = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

const getToken = () =>
  localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");

interface Payment {
  id: string; month: number; amount: number; method: string;
  reference: string | null; receipt_url: string | null;
  status: "confirmed" | "pending" | "rejected"; created_at: string;
}
interface LedgerMonth {
  month: number; expected: number; paid_total: number; pending_total: number;
  balance: number; status: "unpaid" | "partial" | "paid"; payments: Payment[];
}
interface MyLedger {
  donor: { id: string; name: string; bec_name: string | null } | null;
  year: number; expected: number; months: LedgerMonth[];
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

  // Report-a-contribution form
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);
  const [reportAmount, setReportAmount] = useState("");
  const [reportRef, setReportRef] = useState("");
  const [reportReceipt, setReportReceipt] = useState<File | null>(null);
  const [reporting, setReporting] = useState(false);

  const fetchLedger = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/finance/my/ledger?year=${year}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setLedger(data.data);
    } catch { /* leave stale */ } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { fetchLedger(); }, [fetchLedger]);

  const submitReport = async () => {
    const amount = parseFloat(reportAmount);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error("Enter a valid amount"); return; }
    setReporting(true);
    try {
      const fd = new FormData();
      fd.append("year", String(year));
      fd.append("month", String(reportMonth));
      fd.append("amount", String(amount));
      fd.append("method", "gcash");
      if (reportRef) fd.append("reference", reportRef);
      if (reportReceipt) fd.append("receipt", reportReceipt);
      const res = await fetch(`${API}/finance/my/contributions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      toast.success("Contribution reported — pending admin approval");
      setReportOpen(false);
      setReportAmount(""); setReportRef(""); setReportReceipt(null);
      fetchLedger();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReporting(false);
    }
  };

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const totalPaid = ledger?.months.reduce((s, m) => s + m.paid_total, 0) || 0;
  const totalDue = ledger?.months
    .filter((m) => m.month <= now.getMonth() + 1 || year < now.getFullYear())
    .reduce((s, m) => s + m.expected, 0) || 0;
  const totalBalance = ledger?.months.reduce((s, m) => s + m.balance, 0) || 0;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <PhilippinePeso className="h-5 w-5 text-primary" />
              My Contributions
            </CardTitle>
            <div className="flex items-center gap-2">
              {ledger?.donor && (
                <Button size="sm" onClick={() => setReportOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Report
                </Button>
              )}
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-[95px] h-9" aria-label="Year"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !ledger?.donor ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-gray-600 font-medium">No contribution record is linked to your account yet.</p>
              <p className="text-sm text-gray-500">
                Ask a parish admin to link your account in the BEC Dues tab so you can track your monthly contributions here.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-4">
                {ledger.donor.name}{ledger.donor.bec_name ? ` · ${ledger.donor.bec_name}` : ""}
                {ledger.expected > 0 && ` · suggested ${peso(ledger.expected)}/month`}
              </p>
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-gray-500">Given ({year})</p>
                  <p className="text-lg font-semibold text-green-700">{peso(totalPaid)}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-gray-500">Suggested</p>
                  <p className="text-lg font-semibold">{peso(totalDue)}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-gray-500">To go</p>
                  <p className={`text-lg font-semibold ${totalBalance > 0 ? "text-amber-600" : "text-green-700"}`}>
                    {peso(totalBalance)}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {ledger.months.map((m) => (
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
                                <Badge className="ml-1.5 bg-amber-100 text-amber-800 border-0 text-[10px]">pending</Badge>
                              )}
                              {p.status === "rejected" && (
                                <Badge className="ml-1.5 bg-red-100 text-red-800 border-0 text-[10px]">rejected</Badge>
                              )}
                            </span>
                            <span className={`font-medium ${p.status === "rejected" ? "line-through text-gray-400" : ""}`}>
                              {peso(p.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Report contribution dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Report a Contribution</DialogTitle>
            <DialogDescription>
              Sent via GCash? Enter the details and a parish admin will confirm it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); submitReport(); }} className="space-y-4">
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
              <Label htmlFor="r-ref">GCash Reference No.</Label>
              <Input id="r-ref" value={reportRef} placeholder="e.g. 1234567890"
                onChange={(e) => setReportRef(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-receipt">Receipt Screenshot (optional)</Label>
              <Input id="r-receipt" type="file" accept="image/*"
                onChange={(e) => setReportReceipt(e.target.files?.[0] || null)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={reporting}>
                {reporting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Submit Report
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ImageLightbox src={lightboxUrl} alt="Payment receipt" onClose={() => setLightboxUrl(null)} />
    </div>
  );
}
