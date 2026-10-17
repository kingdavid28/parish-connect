import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  Plus, Pencil, Trash2, Search, Loader2, Users, PiggyBank,
  ChevronLeft, ChevronRight, PhilippinePeso, Upload, Download,
} from "lucide-react";
import { toast } from "sonner";
import { API } from "../config";
import ImageLightbox from "../components/ImageLightbox";
import { parseDonorsCsv, DONORS_CSV_TEMPLATE } from "../lib/parseCsv";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];
const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "bank", label: "Bank Transfer" },
  { value: "other", label: "Other" },
];
const PAGE_SIZE = 10;

const getToken = () =>
  localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");

interface Bec { id: string; name: string; expected_amount: number | null; donor_count: number; }
interface Donor {
  id: string; name: string; address: string | null; bec_id: string | null;
  bec_name: string | null; bec_expected: number | null; expected_amount: number | null;
  gcash_number: string | null; linked_user_name: string | null; user_id: string | null;
  notes: string | null; is_active: number;
}
interface Payment {
  id: string; month: number; amount: number; method: string;
  reference: string | null; receipt_url: string | null; receipt_no: string | null;
  status: "confirmed" | "pending" | "rejected" | "voided"; created_at: string;
  voided_at: string | null; void_reason: string | null; voided_by: string | null;
  reversal_of: string | null;
}
interface Ledger {
  donor: Donor; year: number; expected: number; months: LedgerMonth[];
  annual_expected: number; annual_paid: number; net_balance: number; total_pending: number;
}
interface LedgerMonth {
  month: number; expected: number; paid_total: number; pending_total: number;
  balance: number; status: "unpaid" | "partial" | "paid"; payments: Payment[];
}
interface PendingReport {
  id: string; year: number; month: number; amount: number; method: string;
  reference: string | null; receipt_url: string | null; created_at: string;
  donor_id: string | null; donor_name: string | null; bec_name: string | null;
  submitted_by_name: string | null;
}
interface SummaryRow {
  bec_id: string | null; bec_name: string; donors: number; expected_due: number;
  collected: number; paid: number; partial: number; unpaid: number;
}
interface UserOption { id: string; name: string; }

const peso = (n: number) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

export default function FinancePanel() {
  const now = new Date();

  const [becs, setBecs] = useState<Bec[]>([]);
  const [becDialogOpen, setBecDialogOpen] = useState(false);
  const [editingBec, setEditingBec] = useState<Bec | null>(null);
  const [becName, setBecName] = useState("");
  const [becExpected, setBecExpected] = useState("");
  const [savingBec, setSavingBec] = useState(false);

  const [donors, setDonors] = useState<Donor[]>([]);
  const [donorSearch, setDonorSearch] = useState("");
  const [donorPage, setDonorPage] = useState(1);
  const [donorTotal, setDonorTotal] = useState(0);
  const [loadingDonors, setLoadingDonors] = useState(false);

  const [donorDialogOpen, setDonorDialogOpen] = useState(false);
  const [editingDonor, setEditingDonor] = useState<Donor | null>(null);
  const [dForm, setDForm] = useState({ name: "", address: "", becId: "", gcash: "", expected: "", userId: "", notes: "" });
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<UserOption[]>([]);
  const [savingDonor, setSavingDonor] = useState(false);

  // Ledger + month detail
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [ledgerYear, setLedgerYear] = useState(now.getFullYear());
  const [detailMonth, setDetailMonth] = useState<LedgerMonth | null>(null);

  // Payment form (add or edit)
  const [payOpen, setPayOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [payMonth, setPayMonth] = useState(1);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payRef, setPayRef] = useState("");
  const [payReceipt, setPayReceipt] = useState<File | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidModalReason, setVoidModalReason] = useState("");
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<Payment | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);

  // Pending member-reported contributions
  const [pending, setPending] = useState<PendingReport[]>([]);
  const [actingPending, setActingPending] = useState<string | null>(null);
  // Donor-matching dialog for unlinked reports
  const [matchReport, setMatchReport] = useState<PendingReport | null>(null);
  const [matchDonorId, setMatchDonorId] = useState("");
  const [matchDonors, setMatchDonors] = useState<Donor[]>([]);
  const [matchNewName, setMatchNewName] = useState("");

  // Summary
  const [sumYear, setSumYear] = useState(now.getFullYear());
  const [sumMonth, setSumMonth] = useState(now.getMonth() + 1);
  const [summary, setSummary] = useState<SummaryRow[] | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Import / export
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [importErrors, setImportErrors] = useState<{ row: number; message: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${getToken()}`,
  }), []);

  // ── Fetchers ──────────────────────────────────────────────
  const fetchBecs = useCallback(async () => {
    try {
      const res = await fetch(`${API}/finance/becs`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setBecs(data.data || []);
    } catch { /* non-fatal */ }
  }, [authHeaders]);

  const fetchDonors = useCallback(async () => {
    setLoadingDonors(true);
    try {
      const params = new URLSearchParams({ page: String(donorPage), limit: String(PAGE_SIZE) });
      if (donorSearch.trim()) params.set("search", donorSearch.trim());
      const res = await fetch(`${API}/finance/donors?${params}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setDonors(data.data?.items || []);
        setDonorTotal(data.data?.total || 0);
      }
    } catch {
      toast.error("Failed to load donors");
    } finally {
      setLoadingDonors(false);
    }
  }, [authHeaders, donorPage, donorSearch]);

  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const res = await fetch(`${API}/finance/summary?year=${sumYear}&month=${sumMonth}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setSummary(data.data?.becs || []);
    } catch { /* non-fatal */ } finally {
      setLoadingSummary(false);
    }
  }, [authHeaders, sumYear, sumMonth]);

  const fetchLedger = useCallback(async (donorId: string, year: number) => {
    setLoadingLedger(true);
    try {
      const res = await fetch(`${API}/finance/donors/${donorId}/ledger?year=${year}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setLedger(data.data);
    } catch {
      toast.error("Failed to load ledger");
    } finally {
      setLoadingLedger(false);
    }
  }, [authHeaders]);

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch(`${API}/finance/contributions/pending`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setPending(data.data || []);
    } catch { /* non-fatal */ }
  }, [authHeaders]);

  useEffect(() => { fetchBecs(); fetchSummary(); fetchPending(); }, [fetchBecs, fetchSummary, fetchPending]);
  useEffect(() => { fetchDonors(); }, [fetchDonors]);

  useEffect(() => {
    if (!userSearch.trim()) { setUserResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/users/search?q=${encodeURIComponent(userSearch.trim())}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) setUserResults((data.data || []).slice(0, 8));
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [userSearch, authHeaders]);

  // ── BEC actions ───────────────────────────────────────────
  const openBecDialog = (bec: Bec | null) => {
    setEditingBec(bec);
    setBecName(bec?.name || "");
    setBecExpected(bec?.expected_amount != null ? String(bec.expected_amount) : "");
    setBecDialogOpen(true);
  };

  const saveBec = async () => {
    if (!becName.trim()) { toast.error("BEC name is required"); return; }
    setSavingBec(true);
    try {
      const res = await fetch(editingBec ? `${API}/finance/becs/${editingBec.id}` : `${API}/finance/becs`, {
        method: editingBec ? "PUT" : "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: becName.trim(), expected_amount: becExpected || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      toast.success(editingBec ? "BEC updated" : "BEC added");
      setBecDialogOpen(false);
      fetchBecs(); fetchSummary();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingBec(false);
    }
  };

  // ── Donor actions ─────────────────────────────────────────
  const openDonorDialog = (donor: Donor | null) => {
    setEditingDonor(donor);
    setUserSearch(donor?.linked_user_name || "");
    setUserResults([]);
    setDForm(donor ? {
      name: donor.name, address: donor.address || "", becId: donor.bec_id || "",
      gcash: donor.gcash_number || "", expected: donor.expected_amount != null ? String(donor.expected_amount) : "",
      userId: donor.user_id || "", notes: donor.notes || "",
    } : { name: "", address: "", becId: "", gcash: "", expected: "", userId: "", notes: "" });
    setDonorDialogOpen(true);
  };

  const saveDonor = async () => {
    if (!dForm.name.trim()) { toast.error("Name is required"); return; }
    setSavingDonor(true);
    try {
      const res = await fetch(editingDonor ? `${API}/finance/donors/${editingDonor.id}` : `${API}/finance/donors`, {
        method: editingDonor ? "PUT" : "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: dForm.name.trim(), address: dForm.address || null, bec_id: dForm.becId || null,
          gcash_number: dForm.gcash || null, expected_amount: dForm.expected || null,
          user_id: dForm.userId || null, notes: dForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      toast.success(editingDonor ? "Donor updated" : "Donor added");
      setDonorDialogOpen(false);
      fetchDonors(); fetchSummary();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingDonor(false);
    }
  };

  const toggleDonor = async (donor: Donor) => {
    const deactivating = donor.is_active === 1;
    if (deactivating && !confirm(`Deactivate ${donor.name}? Their ledger is kept; reminders stop.`)) return;
    try {
      const res = await fetch(`${API}/finance/donors/${donor.id}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: donor.name, address: donor.address, bec_id: donor.bec_id,
          gcash_number: donor.gcash_number, expected_amount: donor.expected_amount,
          user_id: donor.user_id, notes: donor.notes, is_active: deactivating ? 0 : 1,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(deactivating ? "Donor deactivated" : "Donor reactivated");
      fetchDonors(); fetchSummary();
    } catch {
      toast.error("Failed to update donor");
    }
  };

  // ── Ledger / payments ─────────────────────────────────────
  const openLedger = (donor: Donor) => {
    setDetailMonth(null);
    setLedgerYear(now.getFullYear());
    fetchLedger(donor.id, now.getFullYear());
  };

  const openPaymentForm = (month: number, payment: Payment | null = null) => {
    setEditingPayment(payment);
    setPayMonth(month);
    setPayAmount(payment ? String(payment.amount) : "");
    setPayMethod(payment?.method || "cash");
    setPayRef(payment?.reference || "");
    setPayReceipt(null);
    setVoidReason("");
    setPayOpen(true);
  };

  const savePayment = async () => {
    if (!ledger) return;
    const amount = parseFloat(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error("Enter a valid amount"); return; }
    if (editingPayment?.status === "confirmed" && !voidReason.trim()) {
      toast.error("Reason for correction is required"); return;
    }
    setSavingPayment(true);
    try {
      let res: Response;
      if (editingPayment) {
        const body: Record<string, unknown> = { amount, method: payMethod, reference: payRef || null };
        // Confirmed payments are corrected immutably (void original + replacement);
        // the server requires a reason for the correction.
        if (editingPayment.status === "confirmed") {
          body["void_reason"] = voidReason || null;
        }
        res = await fetch(`${API}/finance/payments/${editingPayment.id}`, {
          method: "PUT",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        const fd = new FormData();
        fd.append("donor_id", ledger.donor.id);
        fd.append("year", String(ledgerYear));
        fd.append("month", String(payMonth));
        fd.append("amount", String(amount));
        fd.append("method", payMethod);
        if (payRef) fd.append("reference", payRef);
        if (payReceipt) fd.append("receipt", payReceipt);
        res = await fetch(`${API}/finance/payments`, { method: "POST", headers: authHeaders(), body: fd });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      toast.success(editingPayment?.status === "confirmed"
        ? "Payment corrected — original voided, replacement recorded"
        : editingPayment ? "Payment corrected" : `${MONTHS_FULL[payMonth - 1]} payment recorded`);
      setPayOpen(false);
      fetchLedger(ledger.donor.id, ledgerYear);
      fetchSummary();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingPayment(false);
    }
  };

  const actOnPending = async (id: string, action: "approve" | "reject", body: object = {}) => {
    setActingPending(id);
    try {
      const res = await fetch(`${API}/finance/payments/${id}/${action}`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      toast.success(action === "approve" ? "Contribution approved" : "Contribution rejected");
      setMatchReport(null);
      fetchPending(); fetchSummary(); fetchBecs();
      if (ledger) fetchLedger(ledger.donor.id, ledgerYear);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActingPending(null);
    }
  };

  // Approve click: linked donor → approve directly; unlinked → open match dialog
  const handleApprove = async (r: PendingReport) => {
    if (r.donor_id) return actOnPending(r.id, "approve");
    setMatchReport(r);
    setMatchDonorId("");
    setMatchNewName(r.submitted_by_name || r.donor_name || "");
    try {
      const res = await fetch(`${API}/finance/donors?limit=50`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setMatchDonors(data.data?.items || []);
    } catch { /* dialog still usable via create-new */ }
  };

  const confirmApprove = () => {
    if (!matchReport) return;
    const body = matchDonorId ? { donor_id: matchDonorId } : { new_donor_name: matchNewName.trim() };
    if (!matchDonorId && !matchNewName.trim()) { toast.error("Pick a donor or enter a new name"); return; }
    actOnPending(matchReport.id, "approve", body);
  };

  const openVoid = (payment: Payment) => {
    if (payment.status === "voided") return;
    setVoidTarget(payment);
    setVoidModalReason("");
    setVoidOpen(true);
  };

  const submitVoid = async () => {
    if (!voidTarget) return;
    if (!voidModalReason.trim()) { toast.error("Void reason is required"); return; }
    setSavingPayment(true);
    try {
      const res = await fetch(`${API}/finance/payments/${voidTarget.id}`, {
        method: "DELETE",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ void_reason: voidModalReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to void");
      toast.success("Payment voided");
      setVoidOpen(false);
      setVoidTarget(null);
      if (ledger) fetchLedger(ledger.donor.id, ledgerYear);
      fetchSummary();
    } catch (e: any) {
      toast.error(e.message || "Failed to void payment");
    } finally {
      setSavingPayment(false);
    }
  };

  // ── Import / export ───────────────────────────────────────
  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseDonorsCsv(text);
    setImportRows(parsed.rows.map((r) => r.data));
    setImportErrors(parsed.errors);
  };

  const runImport = async () => {
    if (!importRows.length) return;
    setImporting(true);
    try {
      const res = await fetch(`${API}/finance/donors/bulk`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Import failed");
      const errs = (data.data?.errors || []).map((e: any) => `Row ${e.row}: ${e.message}`);
      if (errs.length) toast.warning(`Imported ${data.data.imported}. Errors: ${errs.slice(0, 3).join("; ")}`);
      else toast.success(`Imported ${data.data.imported} donor(s)`);
      setImportOpen(false);
      setImportRows([]);
      fetchBecs(); fetchDonors(); fetchSummary();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([DONORS_CSV_TEMPLATE], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "donors-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportCsv = async () => {
    try {
      const res = await fetch(`${API}/finance/export?year=${sumYear}&month=${sumMonth}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `dues-${sumYear}-${String(sumMonth).padStart(2, "0")}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("CSV downloaded");
    } catch {
      toast.error("Export failed");
    }
  };

  const exportStatement = async () => {
    if (!ledger) return;
    try {
      const res = await fetch(`${API}/finance/donors/${ledger.donor.id}/statement?year=${ledgerYear}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `statement-${String(ledger.donor.name).replace(/[^A-Za-z0-9]+/g, "_")}-${ledgerYear}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Statement downloaded");
    } catch {
      toast.error("Export failed");
    }
  };

  const donorTotalPages = Math.max(1, Math.ceil(donorTotal / PAGE_SIZE));
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const cellClass = (status: string) =>
    status === "paid" ? "bg-green-50 border-green-200" :
    status === "partial" ? "bg-amber-50 border-amber-300" :
    "border-dashed hover:border-primary hover:bg-primary/5";

  const ledgerHistory = ledger
    ? ledger.months
        .flatMap((m) => m.payments)
        .sort((a, b) => a.month - b.month || (a.created_at || "").localeCompare(b.created_at || ""))
    : [];

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Monthly summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <PiggyBank className="h-5 w-5 text-primary" />
              Monthly Contributions
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={String(sumMonth)} onValueChange={(v) => setSumMonth(Number(v))}>
                <SelectTrigger className="w-[130px] h-9" aria-label="Summary month"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS_FULL.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(sumYear)} onValueChange={(v) => setSumYear(Number(v))}>
                <SelectTrigger className="w-[95px] h-9" aria-label="Summary year"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={exportCsv} aria-label="Export CSV">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingSummary || !summary ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (() => {
            const expected = summary.reduce((s, r) => s + Number(r.expected_due), 0);
            const collected = summary.reduce((s, r) => s + Number(r.collected), 0);
            const paid = summary.reduce((s, r) => s + r.paid, 0);
            const partial = summary.reduce((s, r) => s + r.partial, 0);
            const unpaid = summary.reduce((s, r) => s + r.unpaid, 0);
            return (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500">Suggested</p>
                    <p className="text-lg font-semibold">{peso(expected)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500">Collected</p>
                    <p className="text-lg font-semibold">{peso(collected)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500">Complete</p>
                    <p className="text-lg font-semibold">{paid}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500">Partial</p>
                    <p className={`text-lg font-semibold ${partial > 0 ? "text-amber-600" : ""}`}>{partial}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500">None yet</p>
                    <p className={`text-lg font-semibold ${unpaid > 0 ? "text-amber-600" : ""}`}>{unpaid}</p>
                  </div>
                </div>
                {summary.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {summary.map((r) => (
                      <Badge key={r.bec_id ?? "none"} variant="secondary" className="font-normal">
                        {r.bec_name}: {peso(r.collected)}/{peso(r.expected_due)} · {r.paid}/{r.donors} complete
                      </Badge>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </CardContent>
      </Card>

      {/* Pending member reports */}
      {pending.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              Pending Reports
              <Badge className="bg-amber-100 text-amber-800 border-0">{pending.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-lg px-3 py-2">
                <div className="text-sm">
                  <span className="font-medium">{r.donor_name || r.submitted_by_name || "Unknown"}</span>
                  {r.bec_name && <span className="text-gray-500"> · {r.bec_name}</span>}
                  {!r.donor_id && (
                    <Badge className="ml-1.5 bg-blue-100 text-blue-800 border-0 text-[10px]">needs donor match</Badge>
                  )}
                  <p className="text-xs text-gray-500">
                    {MONTHS_FULL[r.month - 1]} {r.year} · {r.method}
                    {r.reference && ` · ref ${r.reference}`}
                    {r.submitted_by_name && ` · by ${r.submitted_by_name}`}
                    {r.receipt_url && (
                      <> · <button type="button" className="text-primary hover:underline"
                        onClick={() => setLightboxUrl(r.receipt_url!)}>receipt</button></>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{peso(r.amount)}</span>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={actingPending === r.id}
                    onClick={() => handleApprove(r)}>
                    {actingPending === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200" disabled={actingPending === r.id}
                    onClick={() => actOnPending(r.id, "reject")}>Reject</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* BECs */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-primary" />
              Basic Ecclesial Communities
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => openBecDialog(null)}>
              <Plus className="h-4 w-4 mr-1" /> Add BEC
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {becs.length === 0 && <p className="text-sm text-gray-500">No BECs yet — add one.</p>}
            {becs.map((b) => (
              <button key={b.id} type="button" onClick={() => openBecDialog(b)}
                className="inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-sm hover:border-primary transition-colors"
                title="Edit BEC">
                {b.name}
                {b.expected_amount != null && <span className="text-xs text-gray-500">{peso(b.expected_amount)}/mo suggested</span>}
                <Pencil className="h-3 w-3 text-gray-400" />
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Donors */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <PhilippinePeso className="h-5 w-5 text-primary" />
              Donors
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input value={donorSearch} onChange={(e) => { setDonorSearch(e.target.value); setDonorPage(1); }}
                  placeholder="Search name or address…" className="pl-8 h-9 w-[200px]" aria-label="Search donors" />
              </div>
              <Button variant="outline" size="sm" onClick={() => { setImportRows([]); setImportErrors([]); setImportOpen(true); }}>
                <Upload className="h-4 w-4 mr-1" /> Import
              </Button>
              <Button onClick={() => openDonorDialog(null)} size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add Donor
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingDonors ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : donors.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {donorSearch ? "No donors match your search." : "No donors yet — add or import some."}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden md:table-cell">BEC</TableHead>
                    <TableHead className="hidden sm:table-cell">Suggested</TableHead>
                    <TableHead className="hidden lg:table-cell">Linked User</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {donors.map((d) => {
                    const exp = d.expected_amount ?? d.bec_expected;
                    return (
                      <TableRow key={d.id} className={d.is_active !== 1 ? "opacity-60" : ""}>
                        <TableCell className="font-medium">
                          {d.name}
                          {d.is_active !== 1 && <Badge variant="outline" className="ml-2 text-[10px]">inactive</Badge>}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{d.bec_name || "—"}</TableCell>
                        <TableCell className="hidden sm:table-cell">{exp != null ? peso(exp) : "—"}</TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {d.linked_user_name ? <Badge variant="secondary" className="font-normal">{d.linked_user_name}</Badge> : "—"}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="outline" size="sm" onClick={() => openLedger(d)}>Ledger</Button>
                          <Button variant="ghost" size="sm" onClick={() => openDonorDialog(d)} aria-label={`Edit ${d.name}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => toggleDonor(d)}
                            aria-label={d.is_active === 1 ? `Deactivate ${d.name}` : `Reactivate ${d.name}`}>
                            <Trash2 className={`h-4 w-4 ${d.is_active === 1 ? "text-red-500" : "text-gray-400"}`} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {donorTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-gray-500">
                    Page {donorPage} of {donorTotalPages} · {donorTotal} donor{donorTotal !== 1 ? "s" : ""}
                  </p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={donorPage <= 1} onClick={() => setDonorPage((p) => p - 1)} aria-label="Previous page">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={donorPage >= donorTotalPages} onClick={() => setDonorPage((p) => p + 1)} aria-label="Next page">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* BEC dialog */}
      <Dialog open={becDialogOpen} onOpenChange={setBecDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingBec ? "Edit BEC" : "Add BEC"}</DialogTitle>
            <DialogDescription>{editingBec ? `Update ${editingBec.name}.` : "Create a new community."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveBec(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bec-name">Name <span className="text-red-500">*</span></Label>
              <Input id="bec-name" value={becName} required autoFocus onChange={(e) => setBecName(e.target.value)}
                placeholder="e.g., BEC St. Joseph" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bec-exp">Suggested monthly amount (₱)</Label>
              <Input id="bec-exp" type="number" min="0" step="0.01" value={becExpected}
                onChange={(e) => setBecExpected(e.target.value)} placeholder="e.g., 50 — optional" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBecDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={savingBec}>
                {savingBec && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editingBec ? "Save" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Donor dialog */}
      <Dialog open={donorDialogOpen} onOpenChange={setDonorDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDonor ? "Edit Donor" : "Add Donor"}</DialogTitle>
            <DialogDescription>{editingDonor ? "Update donor details." : "Register a new contribution donor."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveDonor(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="d-name">Name <span className="text-red-500">*</span></Label>
              <Input id="d-name" value={dForm.name} required autoFocus
                onChange={(e) => setDForm({ ...dForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="d-bec">BEC</Label>
                <Select value={dForm.becId || "none"} onValueChange={(v) => setDForm({ ...dForm, becId: v === "none" ? "" : v })}>
                  <SelectTrigger id="d-bec"><SelectValue placeholder="Select BEC" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {becs.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-exp">Suggested monthly (₱)</Label>
                <Input id="d-exp" type="number" min="0" step="0.01" value={dForm.expected}
                  onChange={(e) => setDForm({ ...dForm, expected: e.target.value })} placeholder="Inherit BEC" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="d-gcash">GCash Number</Label>
                <Input id="d-gcash" value={dForm.gcash} inputMode="tel" placeholder="09xxxxxxxxx"
                  onChange={(e) => setDForm({ ...dForm, gcash: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-user">Linked Account</Label>
                <Input id="d-user" value={userSearch} placeholder="Search user…"
                  onChange={(e) => { setUserSearch(e.target.value); setDForm({ ...dForm, userId: "" }); }} />
                {userResults.length > 0 && (
                  <div className="border rounded-md max-h-32 overflow-y-auto">
                    {userResults.map((u) => (
                      <button key={u.id} type="button" className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100"
                        onClick={() => { setDForm({ ...dForm, userId: u.id }); setUserSearch(u.name); setUserResults([]); }}>
                        {u.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-addr">Address</Label>
              <Input id="d-addr" value={dForm.address} onChange={(e) => setDForm({ ...dForm, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-notes">Notes</Label>
              <Input id="d-notes" value={dForm.notes} onChange={(e) => setDForm({ ...dForm, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDonorDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={savingDonor}>
                {savingDonor && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editingDonor ? "Save Changes" : "Add Donor"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Ledger dialog */}
      <Dialog open={!!ledger} onOpenChange={(o) => !o && setLedger(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{ledger?.donor.name} — Ledger</DialogTitle>
            <DialogDescription>
              {ledger?.donor.bec_name || "No BEC"}
              {ledger ? ` · suggested ${ledger.expected > 0 ? peso(ledger.expected) + "/mo" : "not set"}` : ""}
              {" · click a month"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Label htmlFor="ledger-year" className="text-sm">Year</Label>
            <Select value={String(ledgerYear)}
              onValueChange={(v) => { setLedgerYear(Number(v)); ledger && fetchLedger(ledger.donor.id, Number(v)); }}>
              <SelectTrigger id="ledger-year" className="w-[95px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportStatement} disabled={!ledger} aria-label="Export statement">
              <Download className="h-4 w-4" /> Statement
            </Button>
          </div>
          {loadingLedger ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : ledger ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {ledger.months.map((m) => (
                <button key={m.month} type="button" onClick={() => setDetailMonth(m)}
                  className={`rounded-lg border p-2 text-left transition-colors ${cellClass(m.status)}`}>
                  <p className="text-xs text-gray-500">{MONTHS[m.month - 1]}</p>
                  {m.status === "unpaid" ? (
                    <p className="text-sm text-gray-400">—</p>
                  ) : (
                    <p className={`text-sm font-semibold ${m.status === "paid" ? "text-green-700" : "text-amber-700"}`}>
                      {peso(m.paid_total)}
                    </p>
                  )}
                  <p className="text-[10px] text-primary">
                    {m.status === "partial" ? `${peso(m.balance)} to go` : m.status === "paid" ? "complete" : "+ record"}
                  </p>
                </button>
              ))}
            </div>
          ) : null}
          {ledger && (
            <div className="mt-6 border-t pt-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">Annual {ledgerYear}</h3>
                <p className="text-xs text-gray-500">Confirmed payments only; voided/rejected payments stay visible above but never count toward totals.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-gray-500">Expected (annual)</p>
                  <p className="text-lg font-semibold">{peso(ledger.annual_expected)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-gray-500">Paid (confirmed)</p>
                  <p className="text-lg font-semibold text-green-700">{peso(ledger.annual_paid)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-gray-500">Pending approval</p>
                  <p className="text-lg font-semibold text-amber-600">{peso(ledger.total_pending)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-gray-500">Net balance</p>
                  <p className={`text-lg font-semibold ${ledger.net_balance > 0 ? "text-amber-600" : "text-green-700"}`}>{peso(ledger.net_balance)}</p>
                </div>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="border-b px-3 py-2 text-xs font-semibold text-gray-500 uppercase bg-gray-50">
                  Transaction History · {ledgerHistory.length} payment(s)
                </div>
                <div className="py-3 max-h-60 overflow-y-auto">
                  {ledgerHistory.length === 0 ? (
                    <p className="text-xs text-gray-500 px-3 py-2 text-center">No payments this year.</p>
                  ) : (
                    <div className="space-y-0.5">
                      {ledgerHistory.map((p) => (
                        <div key={p.id} className="px-3 py-2 text-sm border-b border-b-gray-100 last:border-0 flex flex-wrap items-center gap-2">
                          <span className="w-20 text-gray-600">{new Date(p.created_at).toISOString().slice(0, 10)}</span>
                          <span className="w-16 text-gray-600 capitalize">{MONTHS[p.month - 1]}</span>
                          <span className={`w-20 text-right font-semibold ${(p.status === "rejected" || p.status === "voided") ? "line-through text-gray-400" : ""}`}>{peso(p.amount)}</span>
                          <span className="w-16 text-gray-600 capitalize">{p.method}</span>
                          <span className="w-24 text-gray-600 truncate">{p.reference || "—"}</span>
                          <span className="w-20 text-gray-600 text-[11px]">{p.receipt_no || "—"}</span>
                          <span className="flex items-center gap-1">
                            <Badge variant={p.status === "confirmed" ? "default" : p.status === "pending" ? "secondary" : "destructive"} className="text-[10px]">
                              {p.status}
                            </Badge>
                            {p.status === "voided" && (
                              <span className="text-[10px] text-gray-400">void</span>
                            )}
                          </span>
                          {p.status === "voided" && p.void_reason && (
                            <span className="ml-2 text-[10px] text-gray-500 italic">void: {p.void_reason}</span>
                          )}
                          {p.status === "voided" && p.reversal_of && (
                            <span className="ml-2 text-[10px] text-gray-400">replaced</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Month detail dialog */}
      <Dialog open={!!detailMonth} onOpenChange={(o) => !o && setDetailMonth(null)}>
        <DialogContent className="max-w-md">
          {detailMonth && ledger && (
            <>
              <DialogHeader>
                <DialogTitle>{MONTHS_FULL[detailMonth.month - 1]} {ledgerYear} — {ledger.donor.name}</DialogTitle>
                <DialogDescription>
                  {detailMonth.expected > 0
                    ? `Suggested ${peso(detailMonth.expected)} · given ${peso(detailMonth.paid_total)} · ${peso(detailMonth.balance)} to go`
                    : `Given ${peso(detailMonth.paid_total)}`}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {detailMonth.payments.length === 0 && (
                  <p className="text-sm text-gray-500 py-3 text-center">No payments recorded for this month.</p>
                )}
                {detailMonth.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                    <div>
                      <p className={`font-semibold ${(p.status === "rejected" || p.status === "voided") ? "line-through text-gray-400" : ""}`}>
                        {peso(p.amount)}
                        {p.status === "pending" && (
                          <Badge className="ml-1.5 bg-amber-100 text-amber-800 border-0 text-[10px]">pending</Badge>
                        )}
                        {p.status === "rejected" && (
                          <Badge className="ml-1.5 bg-red-100 text-red-800 border-0 text-[10px]">rejected</Badge>
                        )}
                        {p.status === "voided" && (
                          <Badge className="ml-1.5 bg-gray-100 text-gray-700 border-0 text-[10px]">voided</Badge>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">
                        {p.method}{p.reference ? ` · ${p.reference}` : ""}
                        {p.receipt_url && (
                          <> · <button type="button" className="text-primary hover:underline"
                            onClick={() => setLightboxUrl(p.receipt_url!)}>receipt</button></>
                        )}
                        {p.status === "voided" && p.void_reason && (
                          <>
                            <br />
                            <span className="text-[10px] text-gray-500">void: {p.void_reason}</span>
                          </>
                        )}
                      </p>
                    </div>
                    {/* Voided and rejected payments are terminal — never edited or re-voided. */}
                    {(p.status === "confirmed" || p.status === "pending") && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openPaymentForm(detailMonth.month, p)} aria-label="Edit payment">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openVoid(p)} aria-label="Void payment">
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button onClick={() => openPaymentForm(detailMonth.month)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Payment
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment form dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPayment ? "Edit Payment" : "Record Payment"}</DialogTitle>
            <DialogDescription>
              {ledger?.donor.name} · {MONTHS_FULL[payMonth - 1]} {ledgerYear}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); savePayment(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="p-amount">Amount (₱) <span className="text-red-500">*</span></Label>
                <Input id="p-amount" type="number" min="0.01" step="0.01" required autoFocus
                  value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-method">Method</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger id="p-method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-ref">Reference No.</Label>
              <Input id="p-ref" value={payRef} placeholder="GCash ref / OR number"
                onChange={(e) => setPayRef(e.target.value)} />
            </div>
            {editingPayment && editingPayment.status === "confirmed" && (
              <div className="space-y-2">
                <Label htmlFor="p-void-reason">Reason for correction <span className="text-red-500">*</span></Label>
                <textarea id="p-void-reason" className="border border-gray-300 rounded p-2 text-sm"
                  value={voidReason} onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Why is this payment being corrected?" />
              </div>
            )}
            {!editingPayment && (
              <div className="space-y-2">
                <Label htmlFor="p-receipt">Receipt (optional)</Label>
                <Input id="p-receipt" type="file" accept="image/*"
                  onChange={(e) => setPayReceipt(e.target.files?.[0] || null)} />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={savingPayment}>
                {savingPayment && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editingPayment ? "Save" : "Record Payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Void payment dialog (reason required — immutable soft void) */}
      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Void Payment</DialogTitle>
            <DialogDescription>
              Voiding keeps the payment in the ledger with a <span className="line-through">line-through</span> mark and full audit trail; it is never hard-deleted.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); void submitVoid(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="v-reason">Reason <span className="text-red-500">*</span></Label>
              <textarea id="v-reason" className="border border-gray-300 rounded p-2 text-sm"
                value={voidModalReason} onChange={(e) => setVoidModalReason(e.target.value)}
                placeholder="Why is this payment being voided?" />
            </div>
            {voidTarget && (
              <p className="text-sm text-gray-600">
                {peso(voidTarget.amount)} · {MONTHS_FULL[voidTarget.month - 1]} · status: <span className="font-semibold capitalize">{voidTarget.status}</span>
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={savingPayment} onClick={() => { setVoidOpen(false); setVoidTarget(null); }}>Cancel</Button>
              <Button type="submit" disabled={savingPayment || !voidModalReason.trim()}>
                {savingPayment && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Void Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Donors (CSV)</DialogTitle>
            <DialogDescription>
              Columns: name, address, bec, gcash, expected. BECs are created if new.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input ref={fileRef} type="file" accept=".csv,text/csv" aria-label="CSV file"
              onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])} />
            {importRows.length > 0 && (
              <p className="text-sm text-green-700">{importRows.length} donor(s) ready to import.</p>
            )}
            {importErrors.length > 0 && (
              <div className="text-sm text-amber-700 max-h-28 overflow-y-auto space-y-0.5">
                {importErrors.slice(0, 10).map((e, i) => <p key={i}>Row {e.row}: {e.message}</p>)}
                {importErrors.length > 10 && <p>…and {importErrors.length - 10} more</p>}
              </div>
            )}
            <button type="button" className="text-sm text-primary hover:underline" onClick={downloadTemplate}>
              Download CSV template
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={runImport} disabled={importing || !importRows.length}>
              {importing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Import {importRows.length > 0 ? importRows.length : ""} Donors
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Donor-match dialog for unlinked reports */}
      <Dialog open={!!matchReport} onOpenChange={(o) => !o && setMatchReport(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Match Donor</DialogTitle>
            <DialogDescription>
              {matchReport && `${matchReport.submitted_by_name || "A member"} reported ${peso(matchReport.amount)} for ${MONTHS_FULL[matchReport.month - 1]} ${matchReport.year}. Pick the donor record — or create one (auto-links their account).`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="match-donor">Existing donor</Label>
              <Select value={matchDonorId || "none"} onValueChange={(v) => setMatchDonorId(v === "none" ? "" : v)}>
                <SelectTrigger id="match-donor"><SelectValue placeholder="Select donor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Create new instead —</SelectItem>
                  {matchDonors.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}{d.bec_name ? ` (${d.bec_name})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!matchDonorId && (
              <div className="space-y-2">
                <Label htmlFor="match-new">New donor name</Label>
                <Input id="match-new" value={matchNewName} onChange={(e) => setMatchNewName(e.target.value)}
                  placeholder="Donor's full name" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchReport(null)}>Cancel</Button>
            <Button onClick={confirmApprove} disabled={actingPending === matchReport?.id}>
              {actingPending === matchReport?.id && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Approve &amp; {matchDonorId ? "Match" : "Create Donor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageLightbox src={lightboxUrl} alt="Payment receipt" onClose={() => setLightboxUrl(null)} />
    </div>
  );
}
