import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "./ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "./ui/select";
import { Loader } from "lucide-react";
import { toast } from "sonner";
import { API } from "../config";

const getToken = () => localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");

export const SERVICE_TYPES = [
  { value: "mass_intention", label: "Mass Intention" },
  { value: "baptism", label: "Baptism" },
  { value: "confirmation", label: "Confirmation" },
  { value: "marriage", label: "Marriage" },
  { value: "funeral", label: "Funeral Service" },
  { value: "blessing", label: "Blessing" },
  { value: "other", label: "Other Service" },
];

export const INTENTION_CATEGORIES = [
  { value: "thanksgiving", label: "Thanksgiving" },
  { value: "deceased", label: "For the Deceased" },
  { value: "healing", label: "Healing" },
  { value: "special", label: "Special Intention" },
];

export interface ServiceFormState {
  type: string;
  intention_category: string;
  person_name: string;
  intention_text: string;
  preferred_date: string;
  preferred_time: string;
  contact_phone: string;
  notes: string;
}

const emptyForm: ServiceFormState = {
  type: "mass_intention", intention_category: "thanksgiving", person_name: "",
  intention_text: "", preferred_date: "", preferred_time: "", contact_phone: "", notes: "",
};

function personPlaceholder(type: string): string {
  if (type === "mass_intention") return "e.g. Juan Dela Cruz";
  if (type === "marriage") return "Groom & Bride names";
  return "Full name";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful submission (for list refresh + donation QR). */
  onSubmitted: () => void;
}

/** Mass intention / parish service request form dialog — owns its form state. */
export default function ServiceRequestDialog({ open, onOpenChange, onSubmitted }: Readonly<Props>) {
  const [form, setForm] = useState<ServiceFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

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
      onOpenChange(false);
      setForm(emptyForm);
      onSubmitted();
    } catch {
      toast.error("Submission failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                {SERVICE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
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
              placeholder={personPlaceholder(form.type)}
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving && <Loader className="h-4 w-4 mr-2 animate-spin" />}
            Submit Request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
