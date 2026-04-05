import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Users,
  Search,
  UserPlus,
  Shield,
  Calendar,
  Mail,
  Phone,
  CheckCircle,
  Clock,
  Loader,
  AlertCircle,
  Crown,
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
  member_since?: string;
  baptism_date?: string;
  family_group?: string;
}

export default function Membership() {
  const navigate = useNavigate();
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "parishioner" as string,
  });

  const API_BASE_URL = '/parish-connect/api';

  const getToken = () => localStorage.getItem('parish_token') || sessionStorage.getItem('parish_token');

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/users`, {
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      const data = await response.json();
      if (data.success) {
        setMembers(Array.isArray(data.data) ? data.data : []);
      }
    } catch (error) {
      console.error('Error fetching members:', error);
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMember = async () => {
    if (!formData.name || !formData.email || !formData.password) {
      toast.error("Please fill in all required fields");
      return;
    }
    try {
      setIsSubmitting(true);
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`,
        },
        body: JSON.stringify(formData),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || "Failed to create member");
      toast.success("Member created successfully");
      setShowCreateDialog(false);
      setFormData({ name: "", email: "", password: "", role: "parishioner" });
      await fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create member");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredMembers = members.filter((member) => {
    const matchesSearch =
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || member.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "superadmin": return <Crown className="h-4 w-4 text-purple-600 flex-shrink-0" />;
      case "admin": return <Shield className="h-4 w-4 text-blue-600 flex-shrink-0" />;
      default: return null;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "superadmin": return <Badge className="bg-purple-600"><Crown className="h-3 w-3 mr-1" />Super Admin</Badge>;
      case "admin": return <Badge className="bg-blue-600"><Shield className="h-3 w-3 mr-1" />Admin</Badge>;
      default: return <Badge variant="secondary">Parishioner</Badge>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Users className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold">Parish Membership</h1>
              <p className="text-gray-600">Connect with fellow parishioners and manage memberships</p>
            </div>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Member
            </Button>
          )}
        </div>

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
                  <p className="text-sm text-gray-600 mb-1">Administrators</p>
                  <p className="text-3xl font-semibold text-blue-600">
                    {members.filter((m) => m.role === "admin" || m.role === "superadmin").length}
                  </p>
                </div>
                <Shield className="h-10 w-10 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Parishioners</p>
                  <p className="text-3xl font-semibold text-green-600">
                    {members.filter((m) => m.role === "parishioner").length}
                  </p>
                </div>
                <CheckCircle className="h-10 w-10 text-green-600" />
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
          {loading && (
            <div className="flex justify-center items-center py-12">
              <Loader className="h-6 w-6 animate-spin" />
            </div>
          )}

          {!loading && (
            <>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search members by name or email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Roles</SelectItem>
                        <SelectItem value="superadmin">Super Admin</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="parishioner">Parishioner</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

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
                              {getRoleIcon(member.role)}
                            </div>
                            <p className="text-sm text-gray-600 truncate">{member.email}</p>
                          </div>
                        </div>

                        <div className="space-y-2 mb-4">
                          {(member.member_since || member.created_at) && (
                            <div className="flex items-center text-sm text-gray-600">
                              <Calendar className="h-4 w-4 mr-2 flex-shrink-0" />
                              <span className="truncate">
                                Member since {format(new Date(member.member_since || member.created_at), "MMM yyyy")}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center text-sm text-gray-600">
                            <Mail className="h-4 w-4 mr-2 flex-shrink-0" />
                            <span className="truncate">{member.email}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t">
                          {getRoleBadge(member.role)}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/profile/${member.id}`)}
                          >
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
                      <p className="text-sm text-gray-500 mt-1">Try adjusting your search criteria</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="families">
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Family groups coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ministries">
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Ministries coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Member Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Member</DialogTitle>
            <DialogDescription>Create a new account for the parish community</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                placeholder="Enter full name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                placeholder="Min. 8 characters"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value })}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="parishioner">Parishioner</SelectItem>
                  {isSuperAdmin && <SelectItem value="admin">Administrator</SelectItem>}
                  {isSuperAdmin && <SelectItem value="superadmin">Super Administrator</SelectItem>}
                </SelectContent>
              </Select>
              {formData.role === "superadmin" && (
                <p className="text-sm text-amber-600 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  This user will have full admin privileges but cannot modify the parent super admin account.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleCreateMember} disabled={isSubmitting}>
              {isSubmitting ? <><Loader className="h-4 w-4 mr-2 animate-spin" />Creating...</> : "Create Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
