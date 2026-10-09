import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "../components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Calendar as CalendarPicker } from "../components/ui/calendar";
import {
  Search, Download, Eye, Lock, BookOpen, Calendar, User, MapPin, Shield, Loader, CalendarIcon, X, Plus, Pencil, Trash2, Upload,
} from "lucide-react";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { parseRecordsCsv, RECORDS_CSV_TEMPLATE, type ParsedCsvRow } from "../lib/parseCsv";
import { format } from "date-fns";
import { toast } from "sonner";
import { useParishConfig } from "../context/ParishConfigContext";

interface SacramentRecord {
  id: string;
  name: string;
  birthday: string;
  parents_name: string;
  baptized_by: string;
  canonical_book: string;
  baptismal_date: string;
  godparents_name: string;
  confirmed_by: string;
  confirmbook_no: string;
  confirmed_date: string;
  confirm_sponsor: string;
}

import { API } from "../config";
const getToken = () => localStorage.getItem('parish_token') || sessionStorage.getItem('parish_token');

const EMPTY_FORM = {
  name: "", birthday: "", parents_name: "", baptized_by: "", canonical_book: "",
  baptismal_date: "", godparents_name: "", confirmed_by: "", confirmbook_no: "",
  confirmed_date: "", confirm_sponsor: "",
};

export default function ParishRecords() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const { features } = useParishConfig();
  const recordsEnabled = features.records !== "off";
  const [records, setRecords] = useState<SacramentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [birthdayFilter, setBirthdayFilter] = useState<Date | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<SacramentRecord | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SacramentRecord | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importRows, setImportRows] = useState<ParsedCsvRow[]>([]);
  const [importErrors, setImportErrors] = useState<{ row: number; message: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const parseImportText = (text: string) => {
    setImportText(text);
    const { rows, errors } = parseRecordsCsv(text);
    setImportRows(rows);
    setImportErrors(errors);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => parseImportText(String(reader.result || ""));
    reader.readAsText(file);
    e.target.value = "";
  };

  const downloadTemplate = () => {
    const blob = new Blob([RECORDS_CSV_TEMPLATE], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sacramental-records-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const submitImport = async () => {
    setImporting(true);
    try {
      const res = await fetch(`${API}/sacraments/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ records: importRows.map((r) => ({ ...r.data, row: r.row })) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Import failed");
        if (data?.data?.errors?.length) setImportErrors(data.data.errors);
        return;
      }
      toast.success(data.message);
      if (data.data?.failed > 0) {
        setImportErrors(data.data.errors || []);
        toast.warning(`${data.data.failed} row${data.data.failed === 1 ? "" : "s"} skipped — see details`);
      } else {
        setImportOpen(false);
        setImportText(""); setImportRows([]); setImportErrors([]);
      }
      fetchRecords(1);
    } catch {
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  };

  const openAddDialog = () => {
    setEditingRecord(null);
    setForm(EMPTY_FORM);
    setEditDialogOpen(true);
  };

  const openEditDialog = (record: SacramentRecord) => {
    setEditingRecord(record);
    setForm({
      name: record.name || "", birthday: record.birthday || "",
      parents_name: record.parents_name || "", baptized_by: record.baptized_by || "",
      canonical_book: record.canonical_book || "", baptismal_date: record.baptismal_date || "",
      godparents_name: record.godparents_name || "", confirmed_by: record.confirmed_by || "",
      confirmbook_no: record.confirmbook_no || "", confirmed_date: record.confirmed_date || "",
      confirm_sponsor: record.confirm_sponsor || "",
    });
    setEditDialogOpen(true);
  };

  const saveRecord = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const url = editingRecord ? `${API}/sacraments/${editingRecord.id}` : `${API}/sacraments`;
      const res = await fetch(url, {
        method: editingRecord ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to save record");
        return;
      }
      toast.success(editingRecord ? "Record updated" : "Record added");
      setEditDialogOpen(false);
      fetchRecords(page);
    } catch {
      toast.error("Failed to save record");
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async (record: SacramentRecord) => {
    if (!window.confirm(`Delete the record for "${record.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API}/sacraments/${record.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to delete record");
        return;
      }
      toast.success("Record deleted");
      fetchRecords(page);
    } catch {
      toast.error("Failed to delete record");
    }
  };

  const field = (key: keyof typeof EMPTY_FORM, label: string, placeholder = "") => (
    <div className="space-y-1.5" key={key}>
      <Label htmlFor={`rec-${key}`} className="text-xs">{label}</Label>
      <Input
        id={`rec-${key}`}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        disabled={saving}
      />
    </div>
  );

  const fetchRecords = async (p = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(p), limit: '20' });
      if (searchQuery) params.set('search', searchQuery);
      if (birthdayFilter) params.set('birthday', format(birthdayFilter, 'yyyy-MM-dd'));

      const res = await fetch(`${API}/sacraments?${params}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        const result = data.data;
        setRecords(result.items || []);
        setTotal(result.total || 0);
        setPage(result.page || 1);
        setHasMore(result.hasMore || false);
      }
    } catch (error) {
      console.error('Failed to fetch records:', error);
      toast.error('Failed to load records');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRecords(); }, []);

  const handleSearch = () => { fetchRecords(1); };

  const safeDate = (d: string) => {
    try {
      // Handle various date formats including Safari's strict parsing
      let date: Date;
      
      // Try standard parsing first
      date = new Date(d);
      
      // If invalid, try ISO format parsing (Safari is stricter)
      if (isNaN(date.getTime())) {
        // Try parsing with timezone handling
        const isoString = d.replace(/ /, 'T');
        date = new Date(isoString);
      }
      
      // If still invalid, try manual parsing
      if (isNaN(date.getTime())) {
        const parsed = Date.parse(d);
        if (!isNaN(parsed)) {
          date = new Date(parsed);
        }
      }
      
      if (isNaN(date.getTime())) return d || 'N/A';
      return format(date, "MMM d, yyyy");
    } catch { return d || 'N/A'; }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24 md:pb-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-white">Parish Records</h1>
              <p className="text-white">Browse and search sacramental records</p>
            </div>
          </div>
          {isAdmin && recordsEnabled && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />Import CSV
              </Button>
              <Button onClick={openAddDialog} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />Add Record
              </Button>
            </div>
          )}
        </div>
      </div>

      {!recordsEnabled ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Lock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Sacramental records are not enabled for this parish</p>
          </CardContent>
        </Card>
      ) : (

      <Tabs defaultValue="baptism" className="space-y-6">
        <TabsList>
          <TabsTrigger value="baptism">Baptism Records</TabsTrigger>
          <TabsTrigger value="confirmation">Confirmation Records</TabsTrigger>
        </TabsList>

        <TabsContent value="baptism" className="space-y-4">
          {/* Search - only for admins */}
          {isAdmin && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="pl-10"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={`w-[200px] justify-start text-left font-normal ${!birthdayFilter ? 'text-muted-foreground' : ''}`}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {birthdayFilter ? format(birthdayFilter, "MMM d, yyyy") : "Birthday"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarPicker
                          mode="single"
                          selected={birthdayFilter}
                          onSelect={(date) => { setBirthdayFilter(date); setCalendarOpen(false); }}
                          captionLayout="dropdown"
                          fromYear={1920}
                          toYear={new Date().getFullYear()}
                          defaultMonth={birthdayFilter || new Date(2000, 0)}
                        />
                      </PopoverContent>
                    </Popover>
                    {birthdayFilter && (
                      <Button variant="ghost" size="sm" onClick={() => setBirthdayFilter(undefined)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Button onClick={handleSearch}>
                    <Search className="h-4 w-4 mr-2" />Search
                  </Button>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
                  <Shield className="h-4 w-4" />
                  <span>{total} record{total !== 1 ? 's' : ''} found</span>
                </div>
              </CardContent>
            </Card>
          )}

          {!isAdmin && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Shield className="h-4 w-4" />
                  <span>Showing your personal sacramental record{total !== 1 ? 's' : ''}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {loading && (
            <div className="flex justify-center items-center py-12">
              <Loader className="h-6 w-6 animate-spin" />
            </div>
          )}

          {!loading && (
            <Card>
              <CardHeader><CardTitle>Baptism Records</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Birthday</TableHead>
                        <TableHead>Baptismal Date</TableHead>
                        <TableHead>Parents</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-medium">{record.name}</TableCell>
                          <TableCell>{safeDate(record.birthday)}</TableCell>
                          <TableCell>{safeDate(record.baptismal_date)}</TableCell>
                          <TableCell className="text-sm text-gray-600">{record.parents_name || 'N/A'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {isAdmin && (
                                <>
                                  <Button variant="ghost" size="sm" onClick={() => openEditDialog(record)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => deleteRecord(record)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </>
                              )}
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => setSelectedRecord(record)}>
                                  <Eye className="h-4 w-4 mr-2" />View
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Sacramental Record</DialogTitle>
                                  <DialogDescription>{record.name}</DialogDescription>
                                </DialogHeader>
                                {selectedRecord && (
                                  <div className="space-y-6">
                                    <div>
                                      <h4 className="font-medium mb-3 flex items-center gap-2">
                                        <User className="h-4 w-4" />Personal Information
                                      </h4>
                                      <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div><span className="text-gray-600">Full Name:</span><p className="font-medium">{selectedRecord.name}</p></div>
                                        <div><span className="text-gray-600">Birthday:</span><p className="font-medium">{safeDate(selectedRecord.birthday)}</p></div>
                                        <div><span className="text-gray-600">Parents:</span><p className="font-medium">{selectedRecord.parents_name || 'N/A'}</p></div>
                                      </div>
                                    </div>
                                    <div>
                                      <h4 className="font-medium mb-3">Baptism Details</h4>
                                      <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div><span className="text-gray-600">Baptismal Date:</span><p className="font-medium">{safeDate(selectedRecord.baptismal_date)}</p></div>
                                        <div><span className="text-gray-600">Baptized By:</span><p className="font-medium">{selectedRecord.baptized_by || 'N/A'}</p></div>
                                        <div><span className="text-gray-600">Godparents:</span><p className="font-medium">{selectedRecord.godparents_name || 'N/A'}</p></div>
                                        <div><span className="text-gray-600">Canonical Book:</span><p className="font-medium">{selectedRecord.canonical_book || 'N/A'}</p></div>
                                      </div>
                                    </div>
                                    {selectedRecord.confirmed_by && (
                                      <div>
                                        <h4 className="font-medium mb-3">Confirmation Details</h4>
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                          <div><span className="text-gray-600">Confirmed Date:</span><p className="font-medium">{safeDate(selectedRecord.confirmed_date)}</p></div>
                                          <div><span className="text-gray-600">Confirmed By:</span><p className="font-medium">{selectedRecord.confirmed_by}</p></div>
                                          <div><span className="text-gray-600">Sponsor:</span><p className="font-medium">{selectedRecord.confirm_sponsor || 'N/A'}</p></div>
                                          <div><span className="text-gray-600">Book No:</span><p className="font-medium">{selectedRecord.confirmbook_no || 'N/A'}</p></div>
                                        </div>
                                      </div>
                                    )}
                                    <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                      <div className="flex items-start gap-3">
                                        <Shield className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                                        <div className="text-sm text-amber-900">
                                          <p className="font-medium mb-1">Verification Notice</p>
                                          <p className="text-amber-700">
                                            This record is for reference only. For legal and official purposes, please visit the parish office to request a verified and authenticated copy of this document.
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {records.length === 0 && (
                  <div className="text-center py-12">
                    <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No records found</p>
                    <p className="text-sm text-gray-500 mt-1">Try adjusting your search criteria</p>
                  </div>
                )}

                {/* Pagination */}
                {total > 20 && (
                  <div className="flex justify-between items-center mt-4 pt-4 border-t">
                    <p className="text-sm text-gray-600">Page {page} of {Math.ceil(total / 20)}</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => fetchRecords(page - 1)}>Previous</Button>
                      <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => fetchRecords(page + 1)}>Next</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-900">
                  <p className="font-medium mb-1">Privacy & Access</p>
                  <p className="text-blue-700">Parish records are protected. Access is granted based on membership verification.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="confirmation" className="space-y-4">
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Confirmation records are included in the baptism record details</p>
              <p className="text-sm text-gray-500 mt-1">Click "View" on any record to see confirmation details</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      )}

      {/* Add / Edit record dialog (admins) */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRecord ? "Edit Record" : "Add Sacramental Record"}</DialogTitle>
            <DialogDescription>
              {editingRecord ? `Update the record for ${editingRecord.name}` : "Enter a new baptismal record. Confirmation fields are optional."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <User className="h-4 w-4" />Personal Information
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {field("name", "Full Name *")}
                {field("birthday", "Birthday", "YYYY-MM-DD")}
                {field("parents_name", "Parents' Names")}
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Baptism Details</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {field("baptismal_date", "Baptismal Date", "YYYY-MM-DD")}
                {field("baptized_by", "Baptized By")}
                {field("godparents_name", "Godparents")}
                {field("canonical_book", "Canonical Book")}
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Confirmation Details (optional)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {field("confirmed_date", "Confirmed Date", "YYYY-MM-DD")}
                {field("confirmed_by", "Confirmed By")}
                {field("confirm_sponsor", "Sponsor")}
                {field("confirmbook_no", "Confirmation Book No.")}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={saving}>Cancel</Button>
              <Button onClick={saveRecord} disabled={saving}>
                {saving && <Loader className="h-4 w-4 mr-2 animate-spin" />}
                {editingRecord ? "Save Changes" : "Add Record"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk CSV import dialog (admins) */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Records from CSV</DialogTitle>
            <DialogDescription>
              Upload a CSV file or paste its contents. The first row must be a header row.
              Columns: name, birthday, parents_name, baptized_by, canonical_book, baptismal_date,
              godparents_name, confirmed_by, confirmbook_no, confirmed_date, confirm_sponsor.
              Quote values containing commas (e.g. "Dela Cruz, Juan"). Max 500 rows per import.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleImportFile}
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />Choose CSV file
              </Button>
              <Button variant="ghost" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" />Download template
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="csv-paste" className="text-xs">Or paste CSV</Label>
              <Textarea
                id="csv-paste"
                value={importText}
                onChange={(e) => parseImportText(e.target.value)}
                placeholder="name,birthday,parents_name,..."
                rows={6}
                className="font-mono text-xs"
              />
            </div>

            {importErrors.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg max-h-32 overflow-y-auto">
                <p className="text-sm font-medium text-amber-900 mb-1">
                  {importErrors.length} issue{importErrors.length === 1 ? "" : "s"}
                </p>
                {importErrors.slice(0, 20).map((e, i) => (
                  <p key={i} className="text-xs text-amber-800">Row {e.row}: {e.message}</p>
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
                  {importRows.length > 10 && ` (showing first 10)`}
                </p>
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Birthday</TableHead>
                        <TableHead>Baptismal Date</TableHead>
                        <TableHead>Parents</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importRows.slice(0, 10).map((r) => (
                        <TableRow key={r.row}>
                          <TableCell className="text-xs text-gray-500">{r.row}</TableCell>
                          <TableCell className="font-medium">{r.data.name}</TableCell>
                          <TableCell>{r.data.birthday || "—"}</TableCell>
                          <TableCell>{r.data.baptismal_date || "—"}</TableCell>
                          <TableCell className="text-sm text-gray-600">{r.data.parents_name || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>Cancel</Button>
              <Button onClick={submitImport} disabled={importing || importRows.length === 0}>
                {importing && <Loader className="h-4 w-4 mr-2 animate-spin" />}
                Import {importRows.length > 0 ? `${importRows.length} record${importRows.length === 1 ? "" : "s"}` : "records"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
