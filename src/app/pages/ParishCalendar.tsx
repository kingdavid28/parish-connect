import { useEffect, useMemo, useState } from "react";
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
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, MapPin, Clock, Loader,
} from "lucide-react";
import { toast } from "sonner";
import { API } from "../config";
import { useAuth } from "../context/AuthContext";

const getToken = () => localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");

interface ParishEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  event_date: string; // YYYY-MM-DD (or ISO from DB)
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  is_all_day: boolean;
  created_by_name?: string | null;
}

type ViewMode = "day" | "month" | "year";

const EVENT_TYPES: { value: string; label: string; color: string }[] = [
  { value: "mass", label: "Mass / Liturgy", color: "bg-purple-100 text-purple-800 border-purple-200" },
  { value: "meeting", label: "Meeting", color: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "wedding", label: "Wedding", color: "bg-pink-100 text-pink-800 border-pink-200" },
  { value: "fiesta", label: "Fiesta / Feast", color: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "celebration", label: "Celebration", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { value: "other", label: "Other", color: "bg-gray-100 text-gray-700 border-gray-200" },
];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const eventDay = (e: ParishEvent) => String(e.event_date).slice(0, 10);

const typeStyle = (t: string) => EVENT_TYPES.find((x) => x.value === t) || EVENT_TYPES[5];

const fmtTime = (e: ParishEvent) =>
  e.is_all_day || !e.start_time ? "All day" : e.end_time ? `${e.start_time} – ${e.end_time}` : e.start_time;

interface EventForm {
  title: string;
  description: string;
  event_type: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  is_all_day: boolean;
}

const emptyForm = (date: string): EventForm => ({
  title: "", description: "", event_type: "mass", event_date: date,
  start_time: "", end_time: "", location: "", is_all_day: true,
});

export default function ParishCalendar() {
  const { isAdmin } = useAuth();
  const today = new Date();
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(dateKey(today));
  const [events, setEvents] = useState<ParishEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ParishEvent | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm(dateKey(today)));
  const [saving, setSaving] = useState(false);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  // Fetch a window around the cursor: month view → that month; year view → the year; day → the day.
  const range = useMemo(() => {
    if (view === "year") return { from: `${year}-01-01`, to: `${year}-12-31` };
    if (view === "day") return { from: selectedDay, to: selectedDay };
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    return { from: dateKey(first), to: dateKey(last) };
  }, [view, year, month, selectedDay]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/events?from=${range.from}&to=${range.to}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (data.success) setEvents(data.data || []);
      } catch {
        toast.error("Failed to load events");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [range]);

  const byDay = useMemo(() => {
    const map = new Map<string, ParishEvent[]>();
    for (const e of events) {
      const k = eventDay(e);
      map.set(k, [...(map.get(k) || []), e]);
    }
    return map;
  }, [events]);

  const monthCells = useMemo(() => {
    const first = new Date(year, month, 1);
    const leading = first.getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = Array(leading).fill(null);
    for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [year, month]);

  const move = (dir: number) => {
    setCursor((c) => {
      if (view === "year") return new Date(c.getFullYear() + dir, c.getMonth(), 1);
      if (view === "day") {
        const d = new Date(selectedDay + "T00:00:00");
        d.setDate(d.getDate() + dir);
        const k = dateKey(d);
        setSelectedDay(k);
        return new Date(d.getFullYear(), d.getMonth(), 1);
      }
      return new Date(c.getFullYear(), c.getMonth() + dir, 1);
    });
  };

  const heading = view === "year" ? String(year)
    : view === "day"
      ? new Date(selectedDay + "T00:00:00").toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : `${MONTHS[month]} ${year}`;

  const openForm = (ev: ParishEvent | null, date?: string) => {
    setEditing(ev);
    setForm(ev
      ? {
          title: ev.title, description: ev.description || "", event_type: ev.event_type,
          event_date: eventDay(ev), start_time: ev.start_time || "", end_time: ev.end_time || "",
          location: ev.location || "", is_all_day: ev.is_all_day,
        }
      : emptyForm(date || selectedDay));
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(editing ? `${API}/events/${editing.id}` : `${API}/events`, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) { toast.error(data.message || "Save failed"); return; }
      toast.success(editing ? "Event updated" : "Event added");
      setFormOpen(false);
      const saved = data.data as ParishEvent;
      setEvents((prev) => {
        const next = prev.filter((e) => e.id !== saved.id).concat(saved);
        return next;
      });
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (ev: ParishEvent) => {
    const res = await fetch(`${API}/events/${ev.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    if (!data.success) { toast.error(data.message || "Delete failed"); return; }
    setEvents((prev) => prev.filter((e) => e.id !== ev.id));
    toast.success("Event deleted");
  };

  const eventChip = (e: ParishEvent, compact = false) => (
    <div key={e.id} className={`rounded border px-1.5 py-0.5 text-[11px] leading-tight truncate ${typeStyle(e.event_type).color}`}
      title={`${e.title}${e.location ? ` — ${e.location}` : ""}`}>
      {compact ? e.title : `${e.is_all_day ? "" : `${e.start_time || ""} `}${e.title}`}
    </div>
  );

  const eventRow = (e: ParishEvent) => (
    <div key={e.id} className={`flex items-start gap-3 rounded-lg border p-3 ${typeStyle(e.event_type).color}`}>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm">{e.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs opacity-80">
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{fmtTime(e)}</span>
          {e.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{e.location}</span>}
          <span className="capitalize">{typeStyle(e.event_type).label}</span>
        </div>
        {e.description && <p className="mt-1 text-xs opacity-80 whitespace-pre-wrap">{e.description}</p>}
      </div>
      {isAdmin && (
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => openForm(e)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => void remove(e)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="container mx-auto px-3 sm:px-4 py-6 max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-blue-600" /> Parish Calendar
        </h1>
        {isAdmin && (
          <Button size="sm" onClick={() => openForm(null)}>
            <Plus className="h-4 w-4 mr-1" /> Add Event
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => move(-1)} aria-label="Previous"><ChevronLeft className="h-5 w-5" /></Button>
              <CardTitle className="text-lg min-w-[180px] text-center">{heading}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => move(1)} aria-label="Next"><ChevronRight className="h-5 w-5" /></Button>
            </div>
            <div className="flex rounded-lg border overflow-hidden">
              {(["day", "month", "year"] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-sm capitalize ${view === v ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-16"><Loader className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : view === "month" ? (
            <div>
              <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-gray-500 mb-1">
                {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden border">
                {monthCells.map((d, i) => {
                  if (!d) return <div key={`e${i}`} className="bg-gray-50 min-h-[72px] sm:min-h-[96px]" />;
                  const k = dateKey(d);
                  const dayEvents = byDay.get(k) || [];
                  const isToday = k === dateKey(today);
                  const isSelected = k === selectedDay;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => { setSelectedDay(k); }}
                      onDoubleClick={() => { setSelectedDay(k); setView("day"); }}
                      className={`bg-white min-h-[72px] sm:min-h-[96px] p-1 text-left align-top hover:bg-blue-50 ${isSelected ? "ring-2 ring-inset ring-blue-500" : ""}`}
                    >
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? "bg-blue-600 text-white font-bold" : "text-gray-700"}`}>
                        {d.getDate()}
                      </span>
                      <div className="mt-0.5 space-y-0.5">
                        {dayEvents.slice(0, 3).map((e) => eventChip(e, true))}
                        {dayEvents.length > 3 && (
                          <div className="text-[10px] text-gray-500 pl-1">+{dayEvents.length - 3} more</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {(byDay.get(selectedDay) || []).length > 0 && (
                <div className="mt-4 space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {new Date(selectedDay + "T00:00:00").toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" })}
                  </h3>
                  {(byDay.get(selectedDay) || []).map(eventRow)}
                </div>
              )}
            </div>
          ) : view === "day" ? (
            <div className="space-y-2">
              {(byDay.get(selectedDay) || []).length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-500">No events scheduled for this day.</p>
              ) : (byDay.get(selectedDay) || []).map(eventRow)}
              {isAdmin && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => openForm(null, selectedDay)}>
                  <Plus className="h-4 w-4 mr-1" /> Add event on this day
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {MONTHS.map((name, m) => {
                const first = new Date(year, m, 1);
                const days = new Date(year, m + 1, 0).getDate();
                const cells: (number | null)[] = Array(first.getDay()).fill(null);
                for (let d = 1; d <= days; d++) cells.push(d);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => { setCursor(new Date(year, m, 1)); setView("month"); }}
                    className="rounded-lg border p-2 text-left hover:border-blue-400 hover:bg-blue-50/40"
                  >
                    <div className="text-xs font-semibold mb-1">{name}</div>
                    <div className="grid grid-cols-7 gap-0 text-[10px] text-center">
                      {WEEKDAYS.map((d) => <div key={d} className="text-gray-400">{d[0]}</div>)}
                      {cells.map((d, i) => {
                        if (!d) return <div key={`e${i}`} />;
                        const k = `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                        const has = (byDay.get(k) || []).length > 0;
                        const isToday = k === dateKey(today);
                        return (
                          <div key={k} className={`relative h-4 leading-4 rounded ${isToday ? "bg-blue-600 text-white font-bold" : ""}`}>
                            {d}
                            {has && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-amber-500" />}
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Event" : "Add Event"}</DialogTitle>
            <DialogDescription>{editing ? "Update this parish event." : "Schedule a new parish event."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ev-title">Title *</Label>
              <Input id="ev-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ev-date">Date *</Label>
                <Input id="ev-date" type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_all_day}
                onChange={(e) => setForm({ ...form, is_all_day: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              All-day event
            </label>
            {!form.is_all_day && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="ev-start">Start</Label>
                  <Input id="ev-start" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ev-end">End</Label>
                  <Input id="ev-end" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="ev-loc">Location</Label>
              <Input id="ev-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength={200} placeholder="e.g. Main Church" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev-desc">Description</Label>
              <textarea
                id="ev-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={2000}
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Save Changes" : "Add Event"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
