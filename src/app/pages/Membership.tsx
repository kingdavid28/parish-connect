import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
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
  Users,
  Search,
  UserPlus,
  Shield,
  Calendar,
  MapPin,
  Mail,
  Phone,
  CheckCircle,
  Clock,
  Loader,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Member {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar: string;
  role: string;
  status: string;
  created_at: string;
  baptism_date?: string;
  family_group?: string;
  ministries?: string[];
}

export default function Membership() {
  const { user, isAdmin } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const API_BASE_URL = '/parish-connect/api';

  // Fetch members from API
  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('parish_token');
      const response = await fetch(`${API_BASE_URL}/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setMembers(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching members:', error);
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const filteredMembers = members.filter((member) => {
    const matchesSearch =
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (member.family_group?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);

    const matchesStatus =
      statusFilter === "all" || member.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const activeMembers = members.filter((m) => m.status === "active").length;
  const pendingMembers = members.filter((m) => m.status === "pending").length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-lg">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold">Parish Membership</h1>
                <p className="text-gray-600">
                  Connect with fellow parishioners and manage memberships
                </p>
              </div>
            </div>
            {isAdmin && (
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Add Member
              </Button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Members</p>
                    <p className="text-3xl font-semibold">{members.length}</p>
                  </div>
                  <Users className="h-10 w-10 text-blue-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Active Members</p>
                    <p className="text-3xl font-semibold text-green-600">
                      {activeMembers}
                    </p>
                  </div>
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Pending</p>
                    <p className="text-3xl font-semibold text-orange-600">
                      {pendingMembers}
                    </p>
                  </div>
                  <Clock className="h-10 w-10 text-orange-600" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Tabs defaultValue="directory" className="space-y-6">
          <TabsList>
            <TabsTrigger value="directory">Member Directory</TabsTrigger>
            <TabsTrigger value="families">Family Groups</TabsTrigger>
            <TabsTrigger value="ministries">Ministries</TabsTrigger>
          </TabsList>

          <TabsContent value="directory" className="space-y-4">
            {/* Loading State */}
            {loading && (
              <div className="flex justify-center items-center py-12">
                <Loader className="h-6 w-6 animate-spin" />
              </div>
            )}

            {/* Search and Filters */}
            {!loading && (
            <>
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search members by name, email, or family..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Members List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMembers.length > 0 ? (
                filteredMembers.map((member) => (
                  <Card key={member.id} className="hover:shadow-lg transition-shadow">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4 mb-4">
                        <Avatar className="h-16 w-16">
                          <AvatarImage src={member.avatar || ""} alt={member.name} />
                          <AvatarFallback>{member.name?.charAt(0) || "?"}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold truncate">{member.name}</h3>
                            {member.role === "admin" && (
                              <Shield className="h-4 w-4 text-purple-600 flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-sm text-gray-600 truncate">{member.email}</p>
                          {member.family_group && (
                            <p className="text-xs text-gray-500 mt-1">
                              {member.family_group}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 mb-4">
                        {member.created_at && (
                          <div className="flex items-center text-sm text-gray-600">
                            <Calendar className="h-4 w-4 mr-2 flex-shrink-0" />
                            <span className="truncate">
                              Member since {format(new Date(member.created_at), "MMM yyyy")}
                            </span>
                          </div>
                        )}
                        {member.phone && (
                          <div className="flex items-center text-sm text-gray-600">
                            <Phone className="h-4 w-4 mr-2 flex-shrink-0" />
                            <span className="truncate">{member.phone}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t">
                        <Badge
                          variant={member.status === "active" ? "default" : "secondary"}
                          className={
                            member.status === "active"
                              ? "bg-green-600"
                              : "bg-orange-500"
                          }
                        >
                          {member.status === "active" ? (
                            <>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Active
                            </>
                          ) : (
                            <>
                              <Clock className="h-3 w-3 mr-1" />
                              Pending
                            </>
                          )}
                        </Badge>
                        <Button variant="ghost" size="sm">
                          View Profile
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="col-span-full">
                  <CardContent className="py-12 text-center">
                    <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No members found</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Try adjusting your search criteria
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
            </>
            )}

          </TabsContent>

          <TabsContent value="families">
            <Card>
              <CardHeader>
                <CardTitle>Family Groups</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {["Rodriguez Family", "Sullivan Family", "Chen Family", "Martinez Family"].map(
                    (family, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <Users className="h-5 w-5 text-blue-600" />
                          <div>
                            <h4 className="font-medium">{family}</h4>
                            <p className="text-sm text-gray-600">
                              {Math.floor(Math.random() * 5) + 2} members
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm">
                          View Family
                        </Button>
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ministries">
            <Card>
              <CardHeader>
                <CardTitle>Parish Ministries</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { name: "Music Ministry", members: 12 },
                    { name: "Ushers", members: 8 },
                    { name: "Altar Servers", members: 15 },
                    { name: "Choir", members: 20 },
                    { name: "Lectors", members: 10 },
                    { name: "Eucharistic Ministers", members: 14 }
                  ].map(
                    (ministry, index) => {
                      return (
                        <div
                          key={index}
                          className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">{ministry.name}</h4>
                            <Badge variant="secondary">{ministry.members} members</Badge>
                          </div>
                          <p className="text-sm text-gray-600">
                            Active ministry serving the parish community
                          </p>
                        </div>
                      );
                    }
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
    </div>
  );
}
