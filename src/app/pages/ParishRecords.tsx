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
import {
  Search, Download, Eye, Lock, BookOpen, Calendar, User, MapPin, Shield, Loader,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

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

const API = '/parish-connect/api';
const getToken = () => localStorage.getItem('parish_token') || sessionStorage.getItem('parish_token');

export default function ParishRecords() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const [records, setRecords] = useState<SacramentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [birthdayFilter, setBirthdayFilter] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<SacramentRecord | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchRecords = async (p = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(p), limit: '20' });
      if (searchQuery) params.set('search', searchQuery);
      if (birthdayFilter) params.set('birthday', birthdayFilter);

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
      const date = new Date(d);
      return isNaN(date.getTime()) ? d : format(date, "MMM d, yyyy");
    } catch { return d || 'N/A'; }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold">Parish Records</h1>
              <p className="text-gray-600">Browse and search sacramental records</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="baptism" className="space-y-6">
        <TabsList>
          <TabsTrigger value="baptism">Baptism Records</TabsTrigger>
          <TabsTrigger value="confirmation">Confirmation Records</TabsTrigger>
        </TabsList>

        <TabsContent value="baptism" className="space-y-4">
          {/* Search - only for superadmins */}
          {isSuperAdmin && (
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
                  <Input
                    type="date"
                    value={birthdayFilter}
                    onChange={(e) => setBirthdayFilter(e.target.value)}
                    className="w-[200px]"
                    placeholder="Birthday"
                  />
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

          {!isSuperAdmin && (
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
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>
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
    </div>
  );
}
