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
import { Search, Plus, Pencil, Trash2, Upload, Download, Loader, Eye, BookOpen, Shield, Printer } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { API } from "../config";
import { useAuth } from "../context/AuthContext";
import UserAccountField from "./UserAccountField";
import { useParishConfig } from "../context/ParishConfigContext";
import { buildCertificatePdf, type CertificateType, type CertificateRecord } from "../lib/certificatePdf";
import {
  parseMarriageCsv, parseDeathCsv,
  MARRIAGE_CSV_TEMPLATE, DEATH_CSV_TEMPLATE,
  type CsvParseResult,
} from "../lib/parseCsv";

const getToken = () => localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");

export interface RegistryField {
  key: string;
  label: string;
  type?: "text" | "date" | "number" | "textarea" | "user";
  required?: boolean;
  placeholder?: string;
  /** For type "user": record column carrying the linked account's display name. */
  userLabelKey?: string;
}

export interface RegistryPanelProps {
  title: string;
  apiPath: string;
  fields: Readonly<RegistryField[]>;
  /** Table columns: key = record column, label = header. */
  columns: Readonly<{ key: string; label: string }[]>;
  csvTemplate?: string;
  csvFileName?: string;
  parseCsv?: (text: string) => CsvParseResult;
  /** Extra fixed query params sent with every list request (e.g. confirmed=1). */
  fixedParams?: Record<string, string>;
  /** View-only mode: hides import/add/edit/delete (search, view, pagination stay). */
  readOnly?: boolean;
  /** Show the Year filter input (default true). */
  showYearFilter?: boolean;
  /** Certificate type — enables a print button that generates a formal certificate PDF. */
  certificateType?: CertificateType;
}

type RegistryRow = Record<string, string | number | null> & { id: string };

export default function RegistryPanel(props: Readonly<RegistryPanelProps>) {
  const { title, apiPath, fields, columns, fixedParams, readOnly = false, showYearFilter = true, csvTemplate, csvFileName, parseCsv, certificateType } = props;
  const { isAdmin } = useAuth();
  const { parish } = useParishConfig();
  const canWrite = isAdmin && !readOnly;

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
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importRows, setImportRows] = useState<{ row: number; data: Record<string, string> }[]>([]);
  const [importErrors, setImportErrors] = useState<{ row: number; message: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [viewRow, setViewRow] = useState<RegistryRow | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchItems = useCallback(async (p = page, s = search, y = year) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(pageSize) });
      if (s.trim()) params.set("search", s.trim());
      if (y.trim()) params.set("year", y.trim());
      for (const [k, v] of Object.entries(fixedParams ?? {})) params.set(k, v);
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
  }, [page, search, year, apiPath, title, fixedParams]);

  useEffect(() => { void fetchItems(1, "", ""); }, [fetchItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderField = (f: RegistryField) => {
    if (f.type === "user") {
      return (
        <UserAccountField
          label=""
          inputId={`reg-${f.key}`}
          value={form[f.key] || ""}
          name={userNames[f.key] || ""}
          onChange={(v, n) => {
            setForm({ ...form, [f.key]: v });
            setUserNames({ ...userNames, [f.key]: n });
          }}
        />
      );
    }
    if (f.type === "textarea") {
      return (
        <Textarea id={`reg-${f.key}`} value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} rows={2} />
      );
    }
    const inputType = f.type === "date" || f.type === "number" ? f.type : "text";
    return (
      <Input
        id={`reg-${f.key}`}
        type={inputType}
        min={f.type === "number" ? 0 : undefined}
        value={form[f.key] || ""}
        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
        placeholder={f.placeholder}
        required={f.required}
      />
    );
  };

  const openForm = (row: RegistryRow | null) => {
    setEditing(row);
    const next: Record<string, string> = {};
    const names: Record<string, string> = {};
    for (const f of fields) {
      const v = row?.[f.key];
      if (v == null) next[f.key] = "";
      else next[f.key] = f.type === "date" ? String(v).slice(0, 10) : String(v);
      if (f.type === "user") names[f.key] = String(row?.[f.userLabelKey || "linked_user_name"] || "");
    }
    setForm(next);
    setUserNames(names);
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

  const printCertificate = (row: RegistryRow) => {
    if (!certificateType) return;
    buildCertificatePdf(certificateType, row as CertificateRecord, parish);
    // Audit the issuance — fire-and-forget; a failed log must not block printing.
    void fetch(`${API}/records/certificates`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ type: certificateType, record_id: row.id }),
    }).catch(() => {});
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
    if (!csvTemplate || !csvFileName) return;
    const blob = new Blob([csvTemplate], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = csvFileName;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const parseImportText = (text: string) => {
    if (!parseCsv) return;
    setImportText(text);
    const result = parseCsv(text);
    setImportRows(result.rows.map((r) => ({ row: r.row, data: r.data })));
    setImportErrors(result.errors);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    parseImportText(await file.text());
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
      setImportText("");
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
    const str = String(v);
    if (!isDate) return str;
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(str.trim());
    const d = iso ? new Date(+iso[1], +iso[2] - 1, +iso[3]) : new Date(str.replace(/ /, "T"));
    return Number.isNaN(d.getTime()) ? str : format(d, "MMM d, yyyy");
  };
  const isDateCol = (key: string) => fields.find((f) => f.key === key)?.type === "date";

  const importLabel = `${importRows.length} record${importRows.length === 1 ? "" : "s"}`;

  const renderRecords = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-12">
          <Loader className="h-6 w-6 animate-spin" />
        </div>
      );
    }
    if (items.length === 0) {
      return (
        <div className="text-center py-12">
          <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No records found</p>
          <p className="text-sm text-gray-500 mt-1">Try adjusting your search criteria</p>
        </div>
      );
    }
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row.id}>
                {columns.map((c) => (
                  <TableCell key={c.key} className="whitespace-nowrap">{fmt(row[c.key], isDateCol(c.key))}</TableCell>
                ))}
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {canWrite && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => openForm(row)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void remove(row)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </>
                    )}
                    {certificateType && isAdmin && (
                      <Button variant="ghost" size="sm" title={`Print ${certificateType} certificate`} onClick={() => printCertificate(row)}>
                        <Printer className="h-4 w-4 mr-2" />Cert
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setViewRow(row)}>
                      <Eye className="h-4 w-4 mr-2" />View
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search toolbar — same chrome as the baptism records tab */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder={`Search ${title.toLowerCase()}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); void fetchItems(1); } }}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              {showYearFilter && (
              <Input
                placeholder="Year"
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); void fetchItems(1); } }}
                className="w-full sm:w-24"
              />
              )}
              <Button onClick={() => { setPage(1); void fetchItems(1); }}>
                <Search className="mr-2 h-4 w-4" />Search
              </Button>
            </div>
            {canWrite && parseCsv && (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />Import CSV
                </Button>
                <Button onClick={() => openForm(null)} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="mr-2 h-4 w-4" />Add Record
                </Button>
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
            <Shield className="h-4 w-4" />
            <span>{total} record{total === 1 ? "" : "s"} found</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent>
          {renderRecords()}

          {/* Pagination — same style as the baptism records tab */}
          {total > pageSize && (
            <div className="flex justify-between items-center mt-4 pt-4 border-t">
              <p className="text-sm text-gray-600">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(page - 1); void fetchItems(page - 1); }}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(page + 1); void fetchItems(page + 1); }}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
                {renderField(f)}
              </div>
            ))}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record detail dialog — same "View" pattern as the baptism tab */}
      <Dialog open={viewRow !== null} onOpenChange={(open) => { if (!open) setViewRow(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title.replace(/s$/, "")} Record</DialogTitle>
            <DialogDescription>Registry record details</DialogDescription>
          </DialogHeader>
          {viewRow && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {fields.map((f) => (
                <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
                  <span className="text-gray-600">{f.label}:</span>
                  <p className="font-medium whitespace-pre-wrap">
                    {f.type === "user"
                      ? String(viewRow[f.userLabelKey || "linked_user_name"] || "—")
                      : fmt(viewRow[f.key], f.type === "date")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* CSV import dialog — same UX as the baptism records import */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import {title}</DialogTitle>
            <DialogDescription>
              Upload a CSV file or paste its contents. The first row must be a header row.{" "}
              <button type="button" className="text-green-700 underline" onClick={downloadTemplate}>
                <Download className="mr-1 inline h-3 w-3" />Download template
              </button>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => void onFile(e)}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />Choose CSV file
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-csv-paste" className="text-xs">Or paste CSV</Label>
              <Textarea
                id="reg-csv-paste"
                value={importText}
                onChange={(e) => parseImportText(e.target.value)}
                placeholder="Paste CSV rows here…"
                rows={5}
                className="font-mono text-xs"
              />
            </div>

            {importErrors.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg max-h-32 overflow-y-auto">
                <p className="text-sm font-medium text-amber-900 mb-1">
                  {importErrors.length} issue{importErrors.length === 1 ? "" : "s"}
                </p>
                {importErrors.slice(0, 20).map((er) => (
                  <p key={`${er.row}-${er.message}`} className="text-xs text-amber-800">Row {er.row}: {er.message}</p>
                ))}
                {importErrors.length > 20 && (
                  <p className="text-xs text-amber-700 mt-1">…and {importErrors.length - 20} more</p>
                )}
              </div>
            )}

            {importRows.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">
                  Preview — {importRows.length} valid row{importRows.length === 1 ? "" : "s"}
                  {importRows.length > 10 && " (showing first 10)"}
                </p>
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        {columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importRows.slice(0, 10).map((r) => (
                        <TableRow key={r.row}>
                          <TableCell className="text-xs text-gray-500">{r.row}</TableCell>
                          {columns.map((c) => (
                            <TableCell key={c.key}>{r.data[c.key] || "—"}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>Cancel</Button>
              <Button onClick={() => void runImport()} disabled={importing || importRows.length === 0}>
                {importing && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                Import {importRows.length > 0 ? importLabel : "records"}
              </Button>
            </div>
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
  certificateType: "marriage",
  columns: [
    { key: "groom_name", label: "Groom" },
    { key: "bride_name", label: "Bride" },
    { key: "marriage_date", label: "Date" },
    { key: "priest", label: "Priest" },
    { key: "record_number", label: "Registry No." },
    { key: "contract_no", label: "Contract No." },
    { key: "linked_user_name", label: "Linked" },
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
    { key: "user_id", label: "Linked account — groom or bride", type: "user", userLabelKey: "linked_user_name" },
    { key: "spouse_user_id", label: "Linked account — other spouse", type: "user", userLabelKey: "linked_spouse_user_name" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  csvTemplate: MARRIAGE_CSV_TEMPLATE,
  csvFileName: "marriage-records-template.csv",
  parseCsv: parseMarriageCsv,
};

export const DEATH_PANEL: RegistryPanelProps = {
  title: "Death Records",
  apiPath: "/records/death",
  certificateType: "death",
  columns: [
    { key: "full_name", label: "Name" },
    { key: "death_date", label: "Date of death" },
    { key: "age", label: "Age" },
    { key: "cemetery", label: "Cemetery" },
    { key: "priest", label: "Priest" },
    { key: "record_number", label: "Registry No." },
    { key: "linked_user_name", label: "Linked" },
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
    { key: "user_id", label: "Linked account", type: "user", userLabelKey: "linked_user_name" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  csvTemplate: DEATH_CSV_TEMPLATE,
  csvFileName: "death-records-template.csv",
  parseCsv: parseDeathCsv,
};

// Confirmation is not a separate registry — it is confirmation data stored on
// each baptism/sacrament record. This panel is a read-only filtered view of
// /sacraments?confirmed=1; edits happen through the Baptism tab.
export const CONFIRMATION_PANEL: RegistryPanelProps = {
  title: "Confirmation Records",
  apiPath: "/sacraments",
  certificateType: "confirmation",
  fixedParams: { confirmed: "1" },
  readOnly: true,
  showYearFilter: false,
  columns: [
    { key: "name", label: "Name" },
    { key: "confirmed_date", label: "Confirmed Date" },
    { key: "confirmed_by", label: "Confirmed By" },
    { key: "confirm_sponsor", label: "Sponsor" },
    { key: "confirmbook_no", label: "Book No." },
  ],
  fields: [
    { key: "name", label: "Full name" },
    { key: "birthday", label: "Birthday" },
    { key: "baptized_by", label: "Baptized by" },
    { key: "baptismal_date", label: "Baptismal date", type: "date" },
    { key: "confirmed_date", label: "Confirmed date", type: "date" },
    { key: "confirmed_by", label: "Confirmed by" },
    { key: "confirm_sponsor", label: "Sponsor" },
    { key: "confirmbook_no", label: "Confirmation book no." },
  ],
};
