import React, { useState } from "react";
import { useAuth, Permission } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  Search,
  Filter,
  Download,
  Eye,
  Lock,
  BookOpen,
  Calendar,
  User,
  MapPin,
  Shield,
  Plus,
  Edit,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface BaptismRecord {
  id: string;
  fullName: string;
  baptismDate: string;
  birthDate: string;
  parents: {
    father: string;
    mother: string;
  };
  godparents: {
    godfather: string;
    godmother: string;
  };
  priest: string;
  location: string;
  recordNumber: string;
  verified: boolean;
}

const MOCK_RECORDS: BaptismRecord[] = [
  {
    id: "1",
    fullName: "Maria Elena Rodriguez",
    baptismDate: "1985-06-12",
    birthDate: "1985-05-24",
    parents: {
      father: "Carlos Rodriguez",
      mother: "Elena Martinez",
    },
    godparents: {
      godfather: "Juan Rodriguez",
      godmother: "Sofia Martinez",
    },
    priest: "Father Thomas Walsh",
    location: "St. Mary's Catholic Church",
    recordNumber: "BR-1985-156",
    verified: true,
  },
  {
    id: "2",
    fullName: "John Patrick Sullivan",
    baptismDate: "1986-03-15",
    birthDate: "1986-02-28",
    parents: {
      father: "Patrick Sullivan",
      mother: "Mary O'Brien",
    },
    godparents: {
      godfather: "Michael Sullivan",
      godmother: "Catherine O'Brien",
    },
    priest: "Father Thomas Walsh",
    location: "St. Mary's Catholic Church",
    recordNumber: "BR-1986-089",
    verified: true,
  },
  {
    id: "3",
    fullName: "Sarah Ming Chen",
    baptismDate: "1992-08-22",
    birthDate: "1992-08-01",
    parents: {
      father: "David Chen",
      mother: "Lisa Wong",
    },
    godparents: {
      godfather: "James Chen",
      godmother: "Michelle Lee",
    },
    priest: "Father Michael O'Connor",
    location: "St. Mary's Catholic Church",
    recordNumber: "BR-1992-234",
    verified: true,
  },
];

export default function ParishRecords() {
  const { isAdmin, hasPermission } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [selectedRecord, setSelectedRecord] = useState<BaptismRecord | null>(null);

  const filteredRecords = MOCK_RECORDS.filter((record) => {
    const matchesSearch =
      record.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.parents.father.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.parents.mother.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesYear =
      yearFilter === "all" ||
      new Date(record.baptismDate).getFullYear().toString() === yearFilter;

    return matchesSearch && matchesYear;
  });

  const years = ["all", ...Array.from(new Set(MOCK_RECORDS.map((r) => 
    new Date(r.baptismDate).getFullYear().toString()
  )))];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-lg">
                <BookOpen className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold">Parish Records</h1>
                <p className="text-gray-600">
                  Browse and search historical parish documents
                </p>
              </div>
            </div>
            {isAdmin && (
              <Button>
                <Download className="h-4 w-4 mr-2" />
                Export Records
              </Button>
            )}
          </div>
        </div>

        <Tabs defaultValue="baptism" className="space-y-6">
          <TabsList>
            <TabsTrigger value="baptism">Baptism Records</TabsTrigger>
            <TabsTrigger value="marriage">Marriage Records</TabsTrigger>
            <TabsTrigger value="confirmation">Confirmation Records</TabsTrigger>
          </TabsList>

          <TabsContent value="baptism" className="space-y-4">
            {/* Search and Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by name, parents, or record number..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={yearFilter} onValueChange={setYearFilter}>
                    <SelectTrigger className="w-[180px]">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Filter by year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Years</SelectItem>
                      {years.filter(y => y !== "all").map((year) => (
                        <SelectItem key={year} value={year}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
                  <Shield className="h-4 w-4" />
                  <span>
                    {filteredRecords.length} verified record{filteredRecords.length !== 1 ? 's' : ''} found
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Records Table */}
            <Card>
              <CardHeader>
                <CardTitle>Baptism Records</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Record #</TableHead>
                        <TableHead>Full Name</TableHead>
                        <TableHead>Baptism Date</TableHead>
                        <TableHead>Parents</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-mono text-sm">
                            {record.recordNumber}
                          </TableCell>
                          <TableCell className="font-medium">
                            {record.fullName}
                          </TableCell>
                          <TableCell>
                            {format(new Date(record.baptismDate), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {record.parents.father} & {record.parents.mother}
                          </TableCell>
                          <TableCell>
                            {record.verified ? (
                              <Badge variant="default" className="bg-green-600">
                                Verified
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Pending</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedRecord(record)}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  View
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Baptism Record Details</DialogTitle>
                                  <DialogDescription>
                                    Record #{record.recordNumber}
                                  </DialogDescription>
                                </DialogHeader>
                                {selectedRecord && (
                                  <div className="space-y-6">
                                    {/* Personal Information */}
                                    <div>
                                      <h4 className="font-medium mb-3 flex items-center gap-2">
                                        <User className="h-4 w-4" />
                                        Personal Information
                                      </h4>
                                      <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                          <span className="text-gray-600">Full Name:</span>
                                          <p className="font-medium">{selectedRecord.fullName}</p>
                                        </div>
                                        <div>
                                          <span className="text-gray-600">Birth Date:</span>
                                          <p className="font-medium">
                                            {format(new Date(selectedRecord.birthDate), "MMMM d, yyyy")}
                                          </p>
                                        </div>
                                        <div>
                                          <span className="text-gray-600">Baptism Date:</span>
                                          <p className="font-medium">
                                            {format(new Date(selectedRecord.baptismDate), "MMMM d, yyyy")}
                                          </p>
                                        </div>
                                        <div>
                                          <span className="text-gray-600">Location:</span>
                                          <p className="font-medium flex items-center gap-1">
                                            <MapPin className="h-3 w-3" />
                                            {selectedRecord.location}
                                          </p>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Parents */}
                                    <div>
                                      <h4 className="font-medium mb-3">Parents</h4>
                                      <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                          <span className="text-gray-600">Father:</span>
                                          <p className="font-medium">{selectedRecord.parents.father}</p>
                                        </div>
                                        <div>
                                          <span className="text-gray-600">Mother:</span>
                                          <p className="font-medium">{selectedRecord.parents.mother}</p>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Godparents */}
                                    <div>
                                      <h4 className="font-medium mb-3">Godparents</h4>
                                      <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                          <span className="text-gray-600">Godfather:</span>
                                          <p className="font-medium">{selectedRecord.godparents.godfather}</p>
                                        </div>
                                        <div>
                                          <span className="text-gray-600">Godmother:</span>
                                          <p className="font-medium">{selectedRecord.godparents.godmother}</p>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Officiating Priest */}
                                    <div>
                                      <h4 className="font-medium mb-2">Officiating Priest</h4>
                                      <p className="text-sm">{selectedRecord.priest}</p>
                                    </div>

                                    {/* Verification Status */}
                                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                      <div className="flex items-center gap-2">
                                        <Shield className="h-5 w-5 text-green-600" />
                                        <div>
                                          <p className="font-medium text-green-900">
                                            Verified Record
                                          </p>
                                          <p className="text-sm text-green-700">
                                            This record has been verified by parish administration
                                          </p>
                                        </div>
                                      </div>
                                    </div>

                                    {isAdmin && (
                                      <div className="flex gap-2">
                                        <Button variant="outline" className="flex-1">
                                          <Download className="h-4 w-4 mr-2" />
                                          Download Certificate
                                        </Button>
                                        <Button variant="outline" className="flex-1">
                                          Edit Record
                                        </Button>
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

                {filteredRecords.length === 0 && (
                  <div className="text-center py-12">
                    <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No records found</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Try adjusting your search criteria
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Privacy Notice */}
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Lock className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-900">
                    <p className="font-medium mb-1">Privacy & Access</p>
                    <p className="text-blue-700">
                      Parish records are protected and access is granted based on membership
                      verification. Full records are only visible to verified parishioners and
                      authorized administrators.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="marriage">
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Marriage records coming soon</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="confirmation">
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Confirmation records coming soon</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
    </div>
  );
}