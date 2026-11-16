import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "./ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "./ui/dialog";
import { Search, Plus, Pencil, Trash2, Upload, Download, Loader, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { API } from "../config";
import { useAuth } from "../context/AuthContext";
import {
  parseMarriageCsv, parseDeathCsv,
  MARRIAGE_CSV_TEMPLATE, DEATH_CSV_TEMPLATE,
  type CsvParseResult,
} from "../lib/parseCsv";

const getToken = () => localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");

export interface RegistryField {
  key: string;
  label: string;
  type?: "text" | "date" | "number" | "textarea";
  required?: boolean;
  placeholder?: string;
}

export interface RegistryPanelProps {
  title: string;
  apiPath: string;
  fields: Readonly<RegistryField[]>;
  /** Table columns: key = record column, label = header. */
  columns: Readonly<{ key: string; label: string }[]>;
  csvTemplate: string;
  csvFileName: string;
  parseCsv: (text: string) => CsvParseResult;
}

type RegistryRow = Record<string, string | number | null> & { id: string };

export default function RegistryPanel(props: Readonly<RegistryPanelProps>) {
  const { title, apiPath, fields, columns, csvTemplate, csvFileName, parseCsv } = props;
  const { isAdmin } = useAuth();

  const [items, setItems] = useState<RegistryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(false);
  const pageSize = 20;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RegistryRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<{ row: number; data: Record<string, string> }[]>([]);
  const [importErrors, setImportErrors] = useState<{ row: number; message: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchItems = useCallback(async (p = page, s = search, y = year) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(pageSize) });
      if (s.trim()) params.set("search", s.trim());
      if (y.trim()) params.set("year", y.trim());
      const res = await fetch(`${API}${apiPath}?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        setItems(data.data.items);
        setTotal(data.data.total);
      }
    } catch {
      toast.error(`Failed to load ${title.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }, [page, search, year, apiPath, title]);

  useEffect(() => { void fetchItems(1, "", ""); }, [fetchItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const openForm = (row: RegistryRow | null) => {
    setEditing(row);
    const next: Record<string, string> = {};
    for (const f of fields) {
      const v = row?.[f.key];
      next[f.key] = v == null ? "" : f.type === "date" ? String(v).slice(0, 10) : String(v);
    }
    setForm(next);
    setDialogOpen(true);
  };

  const save = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(editing ? `${API}${apiPath}/${editing.id}` : `${API}${apiPath}`, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message || "Failed to save"); return; }
      toast.success(editing ? "Record updated" : "Record added");
      setDialogOpen(false);
      void fetchItems();
    } catch {
      toast.error("Failed to save record");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: RegistryRow) => {
    const label = columns.map((c) => row[c.key]).filter(Boolean).slice(0, 2).join(" & ");
    if (!window.confirm(`Delete the record for "${label}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API}${apiPath}/${row.id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message || "Failed to delete"); return; }
      toast.success("Record deleted");
      void fetchItems();
    } catch {
      toast.error("Failed to delete record");
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([csvTemplate], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = csvFileName;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = parseCsv(await file.text());
    setImportRows(result.rows.map((r) => ({ row: r.row, data: r.data })));
    setImportErrors(result.errors);
    if (fileRef.current) fileRef.current.value = "";
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const res = await fetch(`${API}${apiPath}/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ records: importRows.map((r) => ({ ...r.data, row: r.row })) }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message || "Import failed"); return; }
      const { imported, failed, errors } = data.data;
      if (imported > 0) toast.success(`Imported ${imported} record${imported === 1 ? "" : "s"}`);
      if (failed > 0) {
        toast.warning(`${failed} row${failed === 1 ? "" : "s"} skipped`);
        setImportErrors(errors);
        setImportRows([]);
        return;
      }
      setImportOpen(false);
      setImportRows([]);
      setImportErrors([]);
      void fetchItems(1);
      setPage(1);
    } catch {
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fmt = (v: string | number | null | undefined, isDate: boolean) => {
    if (v == null || v === "") return "—";
    return isDate ? String(v).slice(0, 10) : String(v);
  };
  const isDateCol = (key: string) => fields.find((f) => f.key === key)?.type === "date";

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder={`Search ${title.toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); void fetchItems(1); } }}
              className="pl-10"
            />
          </div>
          <Input
            placeholder="Year"
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); void fetchItems(1); } }}
            className="w-full sm:w-24"
          />
          <Button variant="outline" onClick={() => { setPage(1); void fetchItems(1); }}>Search</Button>
          {isAdmin && (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="mr-1 h-4 w-4" /> Import
              </Button>
              <Button onClick={() => openForm(null)}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title} <span className="font-normal text-gray-500">({total})</span></CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 sm:p-6 sm:pt-0">
          {loading ? (
            <div className="flex justify-center py-10"><Loader className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">No records found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
                  {isAdmin && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    {columns.map((c) => (
                      <TableCell key={c.key} className="whitespace-nowrap">{fmt(row[c.key], isDateCol(c.key))}</TableCell>
                    ))}
                    {isAdmin && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openForm(row)} aria-label="Edit record">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => void remove(row)} aria-label="Delete record">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {total > pageSize && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(page - 1); void fetchItems(page - 1); }}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(page + 1); void fetchItems(page + 1); }}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} {title.replace(/s$/, "")}</DialogTitle>
            <DialogDescription>Fields marked * are required.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
                <Label htmlFor={`reg-${f.key}`}>{f.label}{f.required ? " *" : ""}</Label>
                {f.type === "textarea" ? (
                  <Textarea id={`reg-${f.key}`} value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} rows={2} />
                ) : (
                  <Input
                    id={`reg-${f.key}`}
                    type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                    min={f.type === "number" ? 0 : undefined}
                    value={form[f.key] || ""}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    required={f.required}
                  />
                )}
              </div>
            ))}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* CSV import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import {title}</DialogTitle>
            <DialogDescription>
              Upload a CSV with a header row.{" "}
              <button type="button" className="text-green-700 underline" onClick={downloadTemplate}>
                <Download className="mr-1 inline h-3 w-3" />Download template
              </button>
            </DialogDescription>
          </DialogHeader>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e)} className="text-sm" />
          {importErrors.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              {importErrors.slice(0, 20).map((er, i) => <p key={i}>Row {er.row}: {er.message}</p>)}
              {importErrors.length > 20 && <p>…and {importErrors.length - 20} more</p>}
            </div>
          )}
          {importRows.length > 0 && <p className="text-sm text-gray-600">{importRows.length} rows ready to import.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setImportOpen(false)}>Close</Button>
            <Button disabled={importing || importRows.length === 0} onClick={() => void runImport()}>
              {importing ? "Importing…" : `Import ${importRows.length || ""}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Panel configs ────────────────────────────────────────────────────────────

export const MARRIAGE_PANEL: RegistryPanelProps = {
  title: "Marriage Records",
  apiPath: "/records/marriage",
  columns: [
    { key: "groom_name", label: "Groom" },
    { key: "bride_name", label: "Bride" },
    { key: "marriage_date", label: "Date" },
    { key: "priest", label: "Priest" },
    { key: "record_number", label: "Registry No." },
    { key: "contract_no", label: "Contract No." },
  ],
  fields: [
    { key: "groom_name", label: "Groom's full name", required: true },
    { key: "bride_name", label: "Bride's full name", required: true },
    { key: "marriage_date", label: "Marriage date", type: "date", required: true },
    { key: "record_number", label: "Registry / certificate no.", required: true, placeholder: "e.g. MR-2024-001" },
    { key: "contract_no", label: "Marriage contract no.", placeholder: "Civil registry no." },
    { key: "priest", label: "Solemnizing priest", required: true },
    { key: "location", label: "Location / church" },
    { key: "groom_father_name", label: "Groom's father" },
    { key: "groom_mother_name", label: "Groom's mother" },
    { key: "bride_father_name", label: "Bride's father" },
    { key: "bride_mother_name", label: "Bride's mother" },
    { key: "sponsors_names", label: "Sponsors / witnesses", placeholder: "Comma-separated" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  csvTemplate: MARRIAGE_CSV_TEMPLATE,
  csvFileName: "marriage-records-template.csv",
  parseCsv: parseMarriageCsv,
};

export const DEATH_PANEL: RegistryPanelProps = {
  title: "Death Records",
  apiPath: "/records/death",
  columns: [
    { key: "full_name", label: "Name" },
    { key: "death_date", label: "Date of death" },
    { key: "age", label: "Age" },
    { key: "cemetery", label: "Cemetery" },
    { key: "priest", label: "Priest" },
    { key: "record_number", label: "Registry No." },
  ],
  fields: [
    { key: "full_name", label: "Deceased's full name", required: true },
    { key: "death_date", label: "Date of death", type: "date", required: true },
    { key: "record_number", label: "Registry no.", required: true, placeholder: "e.g. DR-2024-001" },
    { key: "birth_date", label: "Birth date", type: "date" },
    { key: "age", label: "Age at death", type: "number" },
    { key: "residence", label: "Residence" },
    { key: "spouse_name", label: "Spouse" },
    { key: "informant_name", label: "Informant / next of kin" },
    { key: "cause_of_death", label: "Cause of death" },
    { key: "cemetery", label: "Cemetery / place of burial" },
    { key: "priest", label: "Officiating priest / minister" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  csvTemplate: DEATH_CSV_TEMPLATE,
  csvFileName: "death-records-template.csv",
  parseCsv: parseDeathCsv,
};
