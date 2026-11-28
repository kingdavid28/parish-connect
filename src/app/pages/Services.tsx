import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { ClipboardList, Plus, Loader, X, Church, Copy, Check } from "lucide-react";
import ServiceRequestDialog, { SERVICE_TYPES as TYPES, INTENTION_CATEGORIES } from "../components/ServiceRequestDialog";
import ImageLightbox from "../components/ImageLightbox";
import { toast } from "sonner";
import { API } from "../config";
import { useAuth } from "../context/AuthContext";

const getToken = () => localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");

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
  const [reviewRow, setReviewRow] = useState<ServiceRequest | null>(null);
  const [reviewStatus, setReviewStatus] = useState("approved");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [donationOpen, setDonationOpen] = useState(false);
  const [gcash, setGcash] = useState<{ gcash_number: string; gcash_name: string; gcash_qr_url: string } | null>(null);
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [qrZoom, setQrZoom] = useState(false);

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

  const handleSubmitted = async () => {
    reload();
    // Offer the customary mass stipend / donation via the parish GCash QR.
    try {
      const gres = await fetch(`${API}/wallet/gcash-info`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const gdata = await gres.json();
      if (gdata.success && (gdata.data.gcash_qr_url || gdata.data.gcash_number)) {
        setGcash(gdata.data);
        setDonationOpen(true);
      }
    } catch {
      // Donation prompt is optional — never block the flow.
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

  const copyGcashNumber = async () => {
    if (!gcash?.gcash_number) return;
    try {
      await navigator.clipboard.writeText(gcash.gcash_number);
      setCopiedNumber(true);
      setTimeout(() => setCopiedNumber(false), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };

  const pendingCount = queue.filter((q) => q.status === "pending").length;

  const renderListContent = () => {
    if (loading) {
      return <div className="flex justify-center py-12"><Loader className="h-6 w-6 animate-spin text-gray-400" /></div>;
    }
    if (tab === "review") {
      return (
        <div className="space-y-2">
          {queue.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">No requests yet.</p>
          ) : queue.map((r) => (
            <RequestCard key={r.id} r={r} isAdmin onReview={openReview} />
          ))}
        </div>
      );
    }
    return (
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
    );
  };

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
          {renderListContent()}
        </CardContent>
      </Card>

      <ServiceRequestDialog open={formOpen} onOpenChange={setFormOpen} onSubmitted={handleSubmitted} />


      {/* Donation QR dialog — shown after a successful submission */}
      <Dialog open={donationOpen} onOpenChange={setDonationOpen}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>Request submitted</DialogTitle>
            <DialogDescription>
              Thank you! If you wish to give the customary mass stipend or a love offering, you may scan the parish GCash QR below. Offerings are voluntary.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {gcash?.gcash_qr_url && (
              <button
                type="button"
                onClick={() => setQrZoom(true)}
                className="mx-auto block w-fit rounded-xl border bg-white p-3 shadow-sm transition-transform hover:scale-[1.02] cursor-zoom-in"
                title="Tap to enlarge for scanning"
              >
                <img src={gcash.gcash_qr_url} alt="Parish GCash QR code — tap to enlarge" className="h-56 w-56 object-contain" />
                <span className="mt-1 block text-[11px] text-gray-400">Tap to enlarge</span>
              </button>
            )}
            {gcash?.gcash_number && (
              <div className="space-y-1">
                <div className="text-sm text-gray-600">GCash {gcash.gcash_name ? `· ${gcash.gcash_name}` : ""}</div>
                <button
                  type="button"
                  onClick={() => void copyGcashNumber()}
                  className="mx-auto flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-lg tracking-wide hover:bg-gray-50"
                  title="Copy number"
                >
                  {gcash.gcash_number}
                  {copiedNumber ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-gray-400" />}
                </button>
              </div>
            )}
            <p className="text-xs text-gray-500">
              Use your name and request type as the GCash reference (e.g. &ldquo;Juan Dela Cruz — Mass Intention&rdquo;) so the office can match your offering.
            </p>
          </div>
          <div className="flex justify-center pt-2">
            <Button onClick={() => setDonationOpen(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ImageLightbox src={qrZoom ? gcash?.gcash_qr_url || null : null} alt="Parish GCash QR code" onClose={() => setQrZoom(false)} />

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
