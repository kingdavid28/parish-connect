import React, { useState } from "react";
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
} from "lucide-react";
import { format } from "date-fns";

interface Member {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar: string;
  role: "admin" | "parishioner";
  status: "active" | "pending";
  memberSince: string;
  baptismDate?: string;
  familyGroup?: string;
  ministries?: string[];
}

const MOCK_MEMBERS: Member[] = [
  {
    id: "1",
    name: "Father Michael O'Connor",
    email: "admin@parish.com",
    phone: "(555) 123-4567",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400",
    role: "admin",
    status: "active",
    memberSince: "2010-01-15",
    ministries: ["Parish Administration", "Youth Ministry"],
  },
  {
    id: "2",
    name: "Maria Rodriguez",
    email: "maria@email.com",
    phone: "(555) 234-5678",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400",
    role: "parishioner",
    status: "active",
    memberSince: "1985-06-12",
    baptismDate: "1985-06-12",
    familyGroup: "Rodriguez Family",
    ministries: ["Choir", "Religious Education"],
  },
  {
    id: "3",
    name: "John Sullivan",
    email: "john.sullivan@email.com",
    phone: "(555) 345-6789",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400",
    role: "parishioner",
    status: "active",
    memberSince: "1986-03-15",
    baptismDate: "1986-03-15",
    familyGroup: "Sullivan Family",
    ministries: ["Knights of Columbus", "Finance Committee"],
  },
  {
    id: "4",
    name: "Sarah Chen",
    email: "sarah.chen@email.com",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400",
    role: "parishioner",
    status: "active",
    memberSince: "1992-08-22",
    baptismDate: "1992-08-22",
    familyGroup: "Chen Family",
    ministries: ["Lectors", "Social Justice Committee"],
  },
  {
    id: "5",
    name: "David Martinez",
    email: "david.m@email.com",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400",
    role: "parishioner",
    status: "pending",
    memberSince: "2026-03-28",
  },
];

const MINISTRIES = [
  "All Ministries",
  "Choir",
  "Religious Education",
  "Youth Ministry",
  "Knights of Columbus",
  "Social Justice Committee",
  "Lectors",
  "Finance Committee",
];

export default function Membership() {
  const { isAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [ministryFilter, setMinistryFilter] = useState("All Ministries");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredMembers = MOCK_MEMBERS.filter((member) => {
    const matchesSearch =
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (member.familyGroup?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);

    const matchesMinistry =
      ministryFilter === "All Ministries" ||
      member.ministries?.includes(ministryFilter);

    const matchesStatus =
      statusFilter === "all" || member.status === statusFilter;

    return matchesSearch && matchesMinistry && matchesStatus;
  });

  const activeMembers = MOCK_MEMBERS.filter((m) => m.status === "active").length;
  const pendingMembers = MOCK_MEMBERS.filter((m) => m.status === "pending").length;

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
                    <p className="text-3xl font-semibold">{MOCK_MEMBERS.length}</p>
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
            {/* Search and Filters */}
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
                  <Select value={ministryFilter} onValueChange={setMinistryFilter}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Filter by ministry" />
                    </SelectTrigger>
                    <SelectContent>
                      {MINISTRIES.map((ministry) => (
                        <SelectItem key={ministry} value={ministry}>
                          {ministry}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              {filteredMembers.map((member) => (
                <Card key={member.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4 mb-4">
                      <Avatar className="h-16 w-16">
                        <AvatarImage src={member.avatar} alt={member.name} />
                        <AvatarFallback>{member.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate">{member.name}</h3>
                          {member.role === "admin" && (
                            <Shield className="h-4 w-4 text-purple-600 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600 truncate">{member.email}</p>
                        {member.familyGroup && (
                          <p className="text-xs text-gray-500 mt-1">
                            {member.familyGroup}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">
                          Member since {format(new Date(member.memberSince), "MMM yyyy")}
                        </span>
                      </div>
                      {member.phone && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Phone className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span className="truncate">{member.phone}</span>
                        </div>
                      )}
                    </div>

                    {member.ministries && member.ministries.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs text-gray-500 mb-2">Ministries:</p>
                        <div className="flex flex-wrap gap-1">
                          {member.ministries.slice(0, 2).map((ministry, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {ministry}
                            </Badge>
                          ))}
                          {member.ministries.length > 2 && (
                            <Badge variant="secondary" className="text-xs">
                              +{member.ministries.length - 2}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

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
              ))}
            </div>

            {filteredMembers.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No members found</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Try adjusting your search criteria
                  </p>
                </CardContent>
              </Card>
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
                  {MINISTRIES.filter((m) => m !== "All Ministries").map(
                    (ministry, index) => {
                      const memberCount = MOCK_MEMBERS.filter((m) =>
                        m.ministries?.includes(ministry)
                      ).length;
                      return (
                        <div
                          key={index}
                          className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">{ministry}</h4>
                            <Badge variant="secondary">{memberCount} members</Badge>
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
