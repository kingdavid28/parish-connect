import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { ClipboardList, Plus, Loader, X, Church } from "lucide-react";
import { toast } from "sonner";
import { API } from "../config";
import { useAuth } from "../context/AuthContext";

const getToken = () => localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");

const TYPES = [
  { value: "mass_intention", label: "Mass Intention" },
  { value: "baptism", label: "Baptism" },
  { value: "confirmation", label: "Confirmation" },
  { value: "marriage", label: "Marriage" },
  { value: "funeral", label: "Funeral Service" },
  { value: "blessing", label: "Blessing" },
  { value: "other", label: "Other Service" },
];

const INTENTION_CATEGORIES = [
  { value: "thanksgiving", label: "Thanksgiving" },
  { value: "deceased", label: "For the Deceased" },
  { value: "healing", label: "Healing" },
  { value: "special", label: "Special Intention" },
];

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  scheduled: "bg-emerald-100 text-emerald-800",
  completed: "bg-gray-100 text-gray-600",
  declined: "bg-red-100 text-red-700",
};

const typeLabel = (t: string) => TYPES.find((x) => x.value === t)?.label || t;
const typeLabelMap = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));

interface ServiceRequest {
  id: string;
  type: string;
  status: string;
  intention_category: string | null;
  person_name: string | null;
  intention_text: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  contact_phone: string | null;
  notes: string | null;
  admin_notes: string | null;
  requester_name?: string | null;
  reviewed_by_name?: string | null;
  created_at: string;
}

const dateOnly = (v: string | null) => (v ? String(v).slice(0, 10) : null);

const fmtDate = (v: string | null) => {
  const d = dateOnly(v);
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";
};

const to12h = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
};

interface FormState {
  type: string;
  intention_category: string;
  person_name: string;
  intention_text: string;
  preferred_date: string;
  preferred_time: string;
  contact_phone: string;
  notes: string;
}

const emptyForm: FormState = {
  type: "mass_intention", intention_category: "thanksgiving", person_name: "",
  intention_text: "", preferred_date: "", preferred_time: "", contact_phone: "", notes: "",
};

function StatusBadge({ status }: Readonly<{ status: string }>) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}>
      {status}
    </span>
  );
}

function RequestCard({ r, isAdmin, onReview, onCancel }: Readonly<{
  r: ServiceRequest;
  isAdmin: boolean;
  onReview?: (r: ServiceRequest) => void;
  onCancel?: (r: ServiceRequest) => void;
}>) {
  const category = r.intention_category ? INTENTION_CATEGORIES.find((c) => c.value === r.intention_category)?.label : null;
  return (
    <div className="rounded-lg border p-3 bg-white space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-sm">{typeLabel(r.type)}</span>
            <StatusBadge status={r.status} />
          </div>
          <div className="text-sm text-gray-700 mt-0.5">
            {category ? `${category}: ` : ""}{r.person_name}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {isAdmin && (r.status === "pending" || r.status === "approved") && onReview && (
            <Button size="sm" variant="outline" onClick={() => onReview(r)}>Review</Button>
          )}
          {!isAdmin && r.status === "pending" && onCancel && (
            <Button size="sm" variant="ghost" title="Cancel request" onClick={() => onCancel(r)}>
              <X className="h-4 w-4 text-red-500" />
            </Button>
          )}
        </div>
      </div>
      <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
        <span>Preferred: {fmtDate(r.preferred_date)}{r.preferred_time ? ` · ${to12h(r.preferred_time)}` : ""}</span>
        {r.requester_name && <span>By: {r.requester_name}</span>}
        {r.contact_phone && <span>{r.contact_phone}</span>}
      </div>
      {r.intention_text && <p className="text-xs text-gray-600 whitespace-pre-wrap">{r.intention_text}</p>}
      {r.notes && <p className="text-xs text-gray-500 whitespace-pre-wrap">Notes: {r.notes}</p>}
      {r.admin_notes && (
        <p className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1">
          Parish response: {r.admin_notes}
        </p>
      )}
    </div>
  );
}

export default function Services() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<"mine" | "review">("mine");
  const [mine, setMine] = useState<ServiceRequest[]>([]);
  const [queue, setQueue] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [reviewRow, setReviewRow] = useState<ServiceRequest | null>(null);
  const [reviewStatus, setReviewStatus] = useState("approved");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const reload = () => setRefresh((r) => r + 1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/services/my`, { headers: { Authorization: `Bearer ${getToken()}` } });
        const data = await res.json();
        if (data.success) setMine(data.data || []);
        if (isAdmin) {
          const r2 = await fetch(`${API}/services`, { headers: { Authorization: `Bearer ${getToken()}` } });
          const d2 = await r2.json();
          if (d2.success) setQueue(d2.data || []);
        }
      } catch {
        toast.error("Failed to load requests");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [isAdmin, refresh]);

  const submit = async () => {
    if (!form.person_name.trim()) { toast.error("Enter who this is for"); return; }
    if (!form.preferred_date) { toast.error("Pick a preferred date"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) { toast.error(data.message || "Submission failed"); return; }
      toast.success("Request submitted — the parish office will review it");
      setFormOpen(false);
      setForm(emptyForm);
      reload();
    } catch {
      toast.error("Submission failed");
    } finally {
      setSaving(false);
    }
  };

  const review = async () => {
    if (!reviewRow) return;
    setReviewing(true);
    try {
      const res = await fetch(`${API}/services/${reviewRow.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ status: reviewStatus, admin_notes: reviewNote || undefined }),
      });
      const data = await res.json();
      if (!data.success) { toast.error(data.message || "Review failed"); return; }
      toast.success(`Request ${reviewStatus}`);
      setReviewRow(null);
      reload();
    } catch {
      toast.error("Review failed");
    } finally {
      setReviewing(false);
    }
  };

  const cancel = async (r: ServiceRequest) => {
    const res = await fetch(`${API}/services/${r.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    if (!data.success) { toast.error(data.message || "Cancel failed"); return; }
    toast.success("Request cancelled");
    reload();
  };

  const openReview = (r: ServiceRequest) => {
    setReviewRow(r);
    setReviewStatus(r.status === "approved" ? "scheduled" : "approved");
    setReviewNote(r.admin_notes || "");
  };

  const pendingCount = queue.filter((q) => q.status === "pending").length;

  return (
    <div className="container mx-auto px-3 sm:px-4 py-6 max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Church className="h-6 w-6 text-blue-600" /> Mass Intentions & Services
        </h1>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Request
        </Button>
      </div>

      {isAdmin && (
        <div className="flex rounded-lg border overflow-hidden w-fit">
          <button
            type="button"
            onClick={() => setTab("mine")}
            className={`px-3 py-1.5 text-sm ${tab === "mine" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            My Requests
          </button>
          <button
            type="button"
            onClick={() => setTab("review")}
            className={`px-3 py-1.5 text-sm ${tab === "review" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            Review Queue{pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-gray-500" />
            {tab === "review" ? "Requests to review" : "My requests"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><Loader className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : tab === "review" ? (
            <div className="space-y-2">
              {queue.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-500">No requests yet.</p>
              ) : queue.map((r) => (
                <RequestCard key={r.id} r={r} isAdmin onReview={openReview} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {mine.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <p className="text-sm text-gray-500">You have no requests yet.</p>
                  <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Submit your first request
                  </Button>
                </div>
              ) : mine.map((r) => (
                <RequestCard key={r.id} r={r} isAdmin={false} onCancel={(row) => void cancel(row)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New request dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Request</DialogTitle>
            <DialogDescription>Submit a mass intention or request a parish service.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.type === "mass_intention" && (
              <div className="space-y-1">
                <Label>Intention</Label>
                <Select value={form.intention_category} onValueChange={(v) => setForm({ ...form, intention_category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTENTION_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="sv-person">
                {form.type === "mass_intention" ? "Offered for *" : "Person / subject *"}
              </Label>
              <Input
                id="sv-person"
                value={form.person_name}
                onChange={(e) => setForm({ ...form, person_name: e.target.value })}
                maxLength={200}
                placeholder={form.type === "mass_intention" ? "e.g. Juan Dela Cruz" : form.type === "marriage" ? "Groom & Bride names" : "Full name"}
              />
            </div>
            {form.type === "mass_intention" && (
              <div className="space-y-1">
                <Label htmlFor="sv-intent">Intention details (optional)</Label>
                <textarea
                  id="sv-intent"
                  value={form.intention_text}
                  onChange={(e) => setForm({ ...form, intention_text: e.target.value })}
                  maxLength={1000}
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="e.g. For the eternal repose of…"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sv-date">Preferred date *</Label>
                <Input id="sv-date" type="date" value={form.preferred_date} onChange={(e) => setForm({ ...form, preferred_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sv-time">Preferred time</Label>
                <Input id="sv-time" type="time" value={form.preferred_time} onChange={(e) => setForm({ ...form, preferred_time: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sv-phone">Contact phone</Label>
              <Input id="sv-phone" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} maxLength={32} placeholder="09xx xxx xxxx" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sv-notes">Notes</Label>
              <textarea
                id="sv-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                maxLength={1000}
                rows={2}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Anything the parish office should know"
              />
            </div>
            <p className="text-xs text-gray-500">The parish office will review your request and respond here. Final scheduling is confirmed by the office.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving && <Loader className="h-4 w-4 mr-2 animate-spin" />}
              Submit Request
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin review dialog */}
      <Dialog open={reviewRow !== null} onOpenChange={(o) => { if (!o) setReviewRow(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review Request</DialogTitle>
            <DialogDescription>
              {reviewRow ? `${typeLabelMap[reviewRow.type] || reviewRow.type} for ${reviewRow.person_name || "—"} — preferred ${fmtDate(reviewRow?.preferred_date ?? null)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Decision</Label>
              <Select value={reviewStatus} onValueChange={setReviewStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approve</SelectItem>
                  <SelectItem value="scheduled">Mark scheduled</SelectItem>
                  <SelectItem value="completed">Mark completed</SelectItem>
                  <SelectItem value="declined">Decline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rv-note">Note to the member (optional)</Label>
              <textarea
                id="rv-note"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                maxLength={1000}
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="e.g. Confirmed for the 8:00 AM mass — please arrive 15 minutes early"
              />
            </div>
            <p className="text-xs text-gray-500">The member is notified in-app and by push when you save.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setReviewRow(null)} disabled={reviewing}>Cancel</Button>
            <Button onClick={() => void review()} disabled={reviewing} variant={reviewStatus === "declined" ? "destructive" : "default"}>
              {reviewing && <Loader className="h-4 w-4 mr-2 animate-spin" />}
              Save Decision
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
