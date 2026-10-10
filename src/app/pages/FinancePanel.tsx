import { useState, useEffect, useCallback } from "react";
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
  ChevronLeft, ChevronRight, PhilippinePeso,
} from "lucide-react";
import { toast } from "sonner";
import { API } from "../config";

const getToken = () =>
  localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");

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

interface Bec { id: string; name: string; donor_count: number; }
interface Donor {
  id: string; name: string; address: string | null; bec_id: string | null;
  bec_name: string | null; gcash_number: string | null;
  linked_user_name: string | null; user_id: string | null;
  notes: string | null; is_active: number;
}
interface Contribution {
  id: string; month: number; amount: number; method: string;
  reference: string | null; receipt_url: string | null;
  recorded_by: string | null; created_at: string;
}
interface SummaryRow {
  bec_id: string | null; bec_name: string; donors: number;
  paid: number; unpaid: number; collected: number;
}
interface UserOption { id: string; name: string; role?: string; }

const peso = (n: number) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

export default function FinancePanel() {
  const now = new Date();

  // BEC state
  const [becs, setBecs] = useState<Bec[]>([]);
  const [newBecName, setNewBecName] = useState("");
  const [addingBec, setAddingBec] = useState(false);

  // Donor state
  const [donors, setDonors] = useState<Donor[]>([]);
  const [donorSearch, setDonorSearch] = useState("");
  const [donorPage, setDonorPage] = useState(1);
  const [donorTotal, setDonorTotal] = useState(0);
  const [loadingDonors, setLoadingDonors] = useState(false);

  // Donor dialog
  const [donorDialogOpen, setDonorDialogOpen] = useState(false);
  const [editingDonor, setEditingDonor] = useState<Donor | null>(null);
  const [dForm, setDForm] = useState({ name: "", address: "", becId: "", gcash: "", userId: "", notes: "" });
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<UserOption[]>([]);
  const [savingDonor, setSavingDonor] = useState(false);

  // Ledger dialog
  const [ledgerDonor, setLedgerDonor] = useState<Donor | null>(null);
  const [ledgerYear, setLedgerYear] = useState(now.getFullYear());
  const [ledgerRows, setLedgerRows] = useState<Contribution[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Payment dialog
  const [payDonor, setPayDonor] = useState<Donor | null>(null);
  const [payMonth, setPayMonth] = useState(now.getMonth() + 1);
  const [payYear, setPayYear] = useState(now.getFullYear());
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payRef, setPayRef] = useState("");
  const [payReceipt, setPayReceipt] = useState<File | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);

  // Summary
  const [sumYear, setSumYear] = useState(now.getFullYear());
  const [sumMonth, setSumMonth] = useState(now.getMonth() + 1);
  const [summary, setSummary] = useState<SummaryRow[] | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

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
      const params = new URLSearchParams({
        page: String(donorPage), limit: String(PAGE_SIZE),
      });
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
      const res = await fetch(
        `${API}/finance/summary?year=${sumYear}&month=${sumMonth}`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      if (data.success) setSummary(data.data?.becs || []);
    } catch { /* non-fatal */ } finally {
      setLoadingSummary(false);
    }
  }, [authHeaders, sumYear, sumMonth]);

  const fetchLedger = useCallback(async (donor: Donor, year: number) => {
    setLoadingLedger(true);
    try {
      const res = await fetch(
        `${API}/finance/donors/${donor.id}/ledger?year=${year}`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      if (data.success) setLedgerRows(data.data?.contributions || []);
    } catch {
      toast.error("Failed to load ledger");
    } finally {
      setLoadingLedger(false);
    }
  }, [authHeaders]);

  useEffect(() => { fetchBecs(); fetchSummary(); }, [fetchBecs, fetchSummary]);
  useEffect(() => { fetchDonors(); }, [fetchDonors]);

  // Linked-user search (debounced)
  useEffect(() => {
    if (!userSearch.trim()) { setUserResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API}/users/search?q=${encodeURIComponent(userSearch.trim())}`,
          { headers: authHeaders() }
        );
        const data = await res.json();
        if (data.success) setUserResults((data.data || []).slice(0, 8));
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [userSearch, authHeaders]);

  // ── Actions ───────────────────────────────────────────────
  const addBec = async () => {
    if (!newBecName.trim()) return;
    setAddingBec(true);
    try {
      const res = await fetch(`${API}/finance/becs`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: newBecName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      setNewBecName("");
      toast.success("BEC added");
      fetchBecs();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingBec(false);
    }
  };

  const openDonorDialog = (donor: Donor | null) => {
    setEditingDonor(donor);
    setUserSearch("");
    setUserResults([]);
    setDForm(donor ? {
      name: donor.name,
      address: donor.address || "",
      becId: donor.bec_id || "",
      gcash: donor.gcash_number || "",
      userId: donor.user_id || "",
      notes: donor.notes || "",
    } : { name: "", address: "", becId: "", gcash: "", userId: "", notes: "" });
    setDonorDialogOpen(true);
  };

  const saveDonor = async () => {
    if (!dForm.name.trim()) { toast.error("Name is required"); return; }
    setSavingDonor(true);
    try {
      const url = editingDonor ? `${API}/finance/donors/${editingDonor.id}` : `${API}/finance/donors`;
      const res = await fetch(url, {
        method: editingDonor ? "PUT" : "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: dForm.name.trim(),
          address: dForm.address || null,
          bec_id: dForm.becId || null,
          gcash_number: dForm.gcash || null,
          user_id: dForm.userId || null,
          notes: dForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      toast.success(editingDonor ? "Donor updated" : "Donor added");
      setDonorDialogOpen(false);
      fetchDonors();
      fetchSummary();
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
          name: donor.name,
          address: donor.address,
          bec_id: donor.bec_id,
          gcash_number: donor.gcash_number,
          user_id: donor.user_id,
          notes: donor.notes,
          is_active: deactivating ? 0 : 1,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(deactivating ? "Donor deactivated" : "Donor reactivated");
      fetchDonors();
      fetchSummary();
    } catch {
      toast.error("Failed to update donor");
    }
  };

  const openLedger = (donor: Donor) => {
    setLedgerDonor(donor);
    setLedgerYear(now.getFullYear());
    fetchLedger(donor, now.getFullYear());
  };

  const openPayment = (donor: Donor, month: number, year: number) => {
    setPayDonor(donor);
    setPayMonth(month);
    setPayYear(year);
    setPayAmount("");
    setPayMethod("cash");
    setPayRef("");
    setPayReceipt(null);
  };

  const savePayment = async () => {
    if (!payDonor) return;
    const amount = parseFloat(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid amount"); return;
    }
    setSavingPayment(true);
    try {
      const fd = new FormData();
      fd.append("donor_id", payDonor.id);
      fd.append("year", String(payYear));
      fd.append("month", String(payMonth));
      fd.append("amount", String(amount));
      fd.append("method", payMethod);
      if (payRef) fd.append("reference", payRef);
      if (payReceipt) fd.append("receipt", payReceipt);
      const res = await fetch(`${API}/finance/contributions`, {
        method: "POST", headers: authHeaders(), body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      toast.success(`${MONTHS_FULL[payMonth - 1]} contribution recorded`);
      fetchSummary();
      if (ledgerDonor) fetchLedger(ledgerDonor, ledgerYear);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingPayment(false);
    }
  };

  const deleteContribution = async (id: string) => {
    if (!confirm("Delete this contribution record? This cannot be undone.")) return;
    try {
      const res = await fetch(`${API}/finance/contributions/${id}`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Contribution deleted");
      if (ledgerDonor) fetchLedger(ledgerDonor, ledgerYear);
      fetchSummary();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const donorTotalPages = Math.max(1, Math.ceil(donorTotal / PAGE_SIZE));
  const ledgerByMonth = new Map<number, Contribution>();
  ledgerRows.forEach((c) => { if (!ledgerByMonth.has(c.month)) ledgerByMonth.set(c.month, c); });
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

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
                <SelectTrigger className="w-[130px] h-9" aria-label="Summary month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS_FULL.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(sumYear)} onValueChange={(v) => setSumYear(Number(v))}>
                <SelectTrigger className="w-[95px] h-9" aria-label="Summary year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingSummary || !summary ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (() => {
            const collected = summary.reduce((s, r) => s + Number(r.collected), 0);
            const paid = summary.reduce((s, r) => s + r.paid, 0);
            const unpaid = summary.reduce((s, r) => s + r.unpaid, 0);
            return (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500">Collected</p>
                    <p className="text-lg font-semibold">{peso(collected)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500">Paid donors</p>
                    <p className="text-lg font-semibold">{paid}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500">Unpaid</p>
                    <p className={`text-lg font-semibold ${unpaid > 0 ? "text-amber-600" : ""}`}>
                      {unpaid}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500">Active donors</p>
                    <p className="text-lg font-semibold">{paid + unpaid}</p>
                  </div>
                </div>
                {summary.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {summary.map((r) => (
                      <Badge key={r.bec_id ?? "none"} variant="secondary" className="font-normal">
                        {r.bec_name}: {peso(r.collected)} · {r.paid}/{r.donors} paid
                      </Badge>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </CardContent>
      </Card>

      {/* BECs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-primary" />
            Basic Ecclesial Communities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-3">
            {becs.length === 0 && (
              <p className="text-sm text-gray-500">No BECs yet — add one below.</p>
            )}
            {becs.map((b) => (
              <Badge key={b.id} variant="outline">{b.name}</Badge>
            ))}
          </div>
          <div className="flex gap-2 max-w-md">
            <Input
              value={newBecName}
              onChange={(e) => setNewBecName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addBec()}
              placeholder="New BEC name (e.g., BEC St. Joseph)"
              aria-label="New BEC name"
            />
            <Button onClick={addBec} disabled={addingBec || !newBecName.trim()} size="sm">
              {addingBec ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Add
            </Button>
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
                <Input
                  value={donorSearch}
                  onChange={(e) => { setDonorSearch(e.target.value); setDonorPage(1); }}
                  placeholder="Search name, BEC, GCash…"
                  className="pl-8 h-9 w-[220px]"
                  aria-label="Search donors"
                />
              </div>
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
              {donorSearch ? "No donors match your search." : "No donors yet — add the first one."}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden md:table-cell">BEC</TableHead>
                    <TableHead className="hidden lg:table-cell">GCash</TableHead>
                    <TableHead className="hidden md:table-cell">Linked User</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {donors.map((d) => (
                    <TableRow key={d.id} className={d.is_active !== 1 ? "opacity-60" : ""}>
                      <TableCell className="font-medium">
                        {d.name}
                        {d.is_active !== 1 && (
                          <Badge variant="outline" className="ml-2 text-[10px]">inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{d.bec_name || "—"}</TableCell>
                      <TableCell className="hidden lg:table-cell">{d.gcash_number || "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {d.linked_user_name ? (
                          <Badge variant="secondary" className="font-normal">{d.linked_user_name}</Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="outline" size="sm" onClick={() => openLedger(d)}>
                          Ledger
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openDonorDialog(d)} aria-label={`Edit ${d.name}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleDonor(d)}
                          aria-label={d.is_active === 1 ? `Deactivate ${d.name}` : `Reactivate ${d.name}`}>
                          <Trash2 className={`h-4 w-4 ${d.is_active === 1 ? "text-red-500" : "text-gray-400"}`} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {donorTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-gray-500">
                    Page {donorPage} of {donorTotalPages} · {donorTotal} donor{donorTotal !== 1 ? "s" : ""}
                  </p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={donorPage <= 1}
                      onClick={() => setDonorPage((p) => p - 1)} aria-label="Previous page">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={donorPage >= donorTotalPages}
                      onClick={() => setDonorPage((p) => p + 1)} aria-label="Next page">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Donor add/edit dialog */}
      <Dialog open={donorDialogOpen} onOpenChange={setDonorDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDonor ? "Edit Donor" : "Add Donor"}</DialogTitle>
            <DialogDescription>
              {editingDonor ? "Update donor details." : "Register a new contribution donor."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveDonor(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="d-name">Name <span className="text-red-500">*</span></Label>
              <Input id="d-name" value={dForm.name} required autoFocus
                onChange={(e) => setDForm({ ...dForm, name: e.target.value })} />
            </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="d-gcash">GCash Number</Label>
                <Input id="d-gcash" value={dForm.gcash} inputMode="tel" placeholder="09xxxxxxxxx"
                  onChange={(e) => setDForm({ ...dForm, gcash: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-user">Linked Account</Label>
                <Input id="d-user" value={userSearch || userResults.find(u => u.id === dForm.userId)?.name || ""}
                  placeholder="Search user…"
                  onChange={(e) => { setUserSearch(e.target.value); setDForm({ ...dForm, userId: "" }); }} />
                {userResults.length > 0 && (
                  <div className="border rounded-md max-h-32 overflow-y-auto">
                    {userResults.map((u) => (
                      <button key={u.id} type="button"
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100"
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
              <Input id="d-addr" value={dForm.address}
                onChange={(e) => setDForm({ ...dForm, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-notes">Notes</Label>
              <Input id="d-notes" value={dForm.notes}
                onChange={(e) => setDForm({ ...dForm, notes: e.target.value })} />
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
      <Dialog open={!!ledgerDonor} onOpenChange={(o) => !o && setLedgerDonor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{ledgerDonor?.name} — Ledger</DialogTitle>
            <DialogDescription>
              {ledgerDonor?.bec_name || "No BEC"} · click a month to record a contribution
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Label htmlFor="ledger-year" className="text-sm">Year</Label>
            <Select value={String(ledgerYear)}
              onValueChange={(v) => { setLedgerYear(Number(v)); ledgerDonor && fetchLedger(ledgerDonor, Number(v)); }}>
              <SelectTrigger id="ledger-year" className="w-[95px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {loadingLedger ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {MONTHS.map((m, i) => {
                const c = ledgerByMonth.get(i + 1);
                return c ? (
                  <div key={m}
                    className="rounded-lg border bg-green-50 border-green-200 p-2 text-left">
                    <p className="text-xs text-gray-500">{m}</p>
                    <p className="text-sm font-semibold text-green-700">{peso(c.amount)}</p>
                    <div className="flex items-center justify-between">
                      {c.receipt_url ? (
                        <button type="button" className="text-[10px] text-primary hover:underline capitalize"
                          onClick={() => window.open(c.receipt_url!, "_blank")}>
                          {c.method} · receipt
                        </button>
                      ) : (
                        <span className="text-[10px] text-gray-400 capitalize">{c.method}</span>
                      )}
                      <button type="button" aria-label={`Delete ${MONTHS_FULL[i]} record`}
                        className="text-red-400 hover:text-red-600"
                        onClick={() => deleteContribution(c.id)}>
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button key={m} type="button"
                    className="rounded-lg border border-dashed p-2 text-left hover:border-primary hover:bg-primary/5 transition-colors"
                    onClick={() => ledgerDonor && openPayment(ledgerDonor, i + 1, ledgerYear)}>
                    <p className="text-xs text-gray-500">{m}</p>
                    <p className="text-sm text-gray-400">—</p>
                    <p className="text-[10px] text-primary">+ record</p>
                  </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={!!payDonor} onOpenChange={(o) => !o && setPayDonor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Contribution</DialogTitle>
            <DialogDescription>
              {payDonor?.name} · {MONTHS_FULL[payMonth - 1]} {payYear}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); savePayment(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="p-amount">Amount (₱) <span className="text-red-500">*</span></Label>
                <Input id="p-amount" type="number" min="0.01" step="0.01" required autoFocus
                  value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="0.00" />
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
            <div className="space-y-2">
              <Label htmlFor="p-receipt">Receipt (optional)</Label>
              <Input id="p-receipt" type="file" accept="image/*"
                onChange={(e) => setPayReceipt(e.target.files?.[0] || null)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayDonor(null)}>Cancel</Button>
              <Button type="submit" disabled={savingPayment}>
                {savingPayment && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Record Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
