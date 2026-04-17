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
import { Textarea } from "../components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../components/ui/alert-dialog";
import {
  Users, Search, UserPlus, Shield, Calendar, Mail, CheckCircle,
  Loader, AlertCircle, Crown, Plus, Pencil, Trash2, UserCheck,
  ChevronRight, Heart, Church,
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

interface FamilyGroup {
  id: string;
  name: string;
  description: string;
  created_by: string;
  created_by_name: string;
  member_count: number;
  is_member: number;
  created_at: string;
  members?: { id: string; name: string; avatar: string; relationship: string }[];
}

interface Ministry {
  id: string;
  name: string;
  description: string;
  schedule: string;
  contact_name: string;
  contact_email: string;
  member_count: number;
  is_member: number;
  created_at: string;
}

const API = '/parish-connect/api';
const getToken = () => localStorage.getItem('parish_token') || sessionStorage.getItem('parish_token');

const RELATIONSHIP_LABELS: Record<string, string> = {
  parent: 'Parent', child: 'Child', spouse: 'Spouse', sibling: 'Sibling',
  grandparent: 'Grandparent', grandchild: 'Grandchild', relative: 'Relative', other: 'Other',
};

export default function Membership() {
  const navigate = useNavigate();
  const { user, isAdmin, isSuperAdmin } = useAuth();

  // ── Directory ──────────────────────────────────────────────────────────────
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", password: "", role: "parishioner" as string });

  // ── Family groups ──────────────────────────────────────────────────────────
  const [families, setFamilies] = useState<FamilyGroup[]>([]);
  const [loadingFamilies, setLoadingFamilies] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState<FamilyGroup | null>(null);
  const [showFamilyDialog, setShowFamilyDialog] = useState(false);
  const [showFamilyDetail, setShowFamilyDetail] = useState(false);
  const [familyForm, setFamilyForm] = useState({ name: "", description: "" });
  const [editingFamily, setEditingFamily] = useState<FamilyGroup | null>(null);
  const [deletingFamily, setDeletingFamily] = useState<FamilyGroup | null>(null);
  const [addMemberForm, setAddMemberForm] = useState({ user_id: "", relationship: "other" });
  const [showAddMember, setShowAddMember] = useState(false);

  // ── Ministries ─────────────────────────────────────────────────────────────
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [loadingMinistries, setLoadingMinistries] = useState(false);
  const [showMinistryDialog, setShowMinistryDialog] = useState(false);
  const [ministryForm, setMinistryForm] = useState({ name: "", description: "", schedule: "", contact_name: "", contact_email: "" });
  const [editingMinistry, setEditingMinistry] = useState<Ministry | null>(null);
  const [deletingMinistry, setDeletingMinistry] = useState<Ministry | null>(null);
  const [joiningMinistry, setJoiningMinistry] = useState<string | null>(null);

  const API_BASE_URL = API;

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/users/search?all=1`, {
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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
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

  // ── Family group handlers ────────────────────────────────────────────────
  const fetchFamilies = async () => {
    try {
      setLoadingFamilies(true);
      const res = await fetch(`${API}/families`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setFamilies(data.data || []);
    } catch { toast.error('Failed to load family groups'); }
    finally { setLoadingFamilies(false); }
  };

  const openFamilyDetail = async (family: FamilyGroup) => {
    setSelectedFamily(family);
    setShowFamilyDetail(true);
    try {
      const res = await fetch(`${API}/families/${family.id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setSelectedFamily(data.data);
    } catch { /* keep existing data */ }
  };

  const handleSaveFamily = async () => {
    if (!familyForm.name.trim()) { toast.error('Group name is required'); return; }
    setIsSubmitting(true);
    try {
      const url = editingFamily ? `${API}/families/${editingFamily.id}` : `${API}/families`;
      const res = await fetch(url, {
        method: editingFamily ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(familyForm),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      toast.success(editingFamily ? 'Family group updated' : 'Family group created');
      setShowFamilyDialog(false);
      setEditingFamily(null);
      setFamilyForm({ name: '', description: '' });
      fetchFamilies();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to save'); }
    finally { setIsSubmitting(false); }
  };

  const handleDeleteFamily = async () => {
    if (!deletingFamily) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API}/families/${deletingFamily.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      toast.success('Family group deleted');
      setDeletingFamily(null);
      fetchFamilies();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to delete'); }
    finally { setIsSubmitting(false); }
  };

  const handleAddFamilyMember = async () => {
    if (!selectedFamily || !addMemberForm.user_id) { toast.error('Select a member'); return; }
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API}/families/${selectedFamily.id}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(addMemberForm),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      toast.success('Member added');
      setShowAddMember(false);
      setAddMemberForm({ user_id: '', relationship: 'other' });
      openFamilyDetail(selectedFamily);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to add member'); }
    finally { setIsSubmitting(false); }
  };

  const handleRemoveFamilyMember = async (groupId: string, memberId: string) => {
    try {
      const res = await fetch(`${API}/families/${groupId}/members`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: memberId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      toast.success('Member removed');
      if (selectedFamily) openFamilyDetail(selectedFamily);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to remove member'); }
  };

  // ── Ministry handlers ────────────────────────────────────────────────────
  const fetchMinistries = async () => {
    try {
      setLoadingMinistries(true);
      const res = await fetch(`${API}/ministries`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setMinistries(data.data || []);
    } catch { toast.error('Failed to load ministries'); }
    finally { setLoadingMinistries(false); }
  };

  const handleSaveMinistry = async () => {
    if (!ministryForm.name.trim()) { toast.error('Ministry name is required'); return; }
    setIsSubmitting(true);
    try {
      const url = editingMinistry ? `${API}/ministries/${editingMinistry.id}` : `${API}/ministries`;
      const res = await fetch(url, {
        method: editingMinistry ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(ministryForm),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      toast.success(editingMinistry ? 'Ministry updated' : 'Ministry created');
      setShowMinistryDialog(false);
      setEditingMinistry(null);
      setMinistryForm({ name: '', description: '', schedule: '', contact_name: '', contact_email: '' });
      fetchMinistries();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to save'); }
    finally { setIsSubmitting(false); }
  };

  const handleDeleteMinistry = async () => {
    if (!deletingMinistry) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API}/ministries/${deletingMinistry.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      toast.success('Ministry deleted');
      setDeletingMinistry(null);
      fetchMinistries();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to delete'); }
    finally { setIsSubmitting(false); }
  };

  const handleToggleMinistry = async (ministry: Ministry) => {
    setJoiningMinistry(ministry.id);
    try {
      const url = `${API}/ministries/${ministry.id}/${ministry.is_member ? 'leave' : 'join'}`;
      const res = await fetch(url, {
        method: ministry.is_member ? 'DELETE' : 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      toast.success(ministry.is_member ? 'Left ministry' : 'Joined ministry!');
      fetchMinistries();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setJoiningMinistry(null); }
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
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24 md:pb-6">
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

      <Tabs defaultValue="directory" className="space-y-6" onValueChange={(v) => {
        if (v === 'families' && families.length === 0) fetchFamilies();
        if (v === 'ministries' && ministries.length === 0) fetchMinistries();
      }}>
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

        {/* ── FAMILY GROUPS TAB ─────────────────────────────────────────── */}
        <TabsContent value="families" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Parish family groups and household connections</p>
            {isAdmin && (
              <Button size="sm" onClick={() => { setEditingFamily(null); setFamilyForm({ name: '', description: '' }); setShowFamilyDialog(true); }}>
                <Plus className="h-4 w-4 mr-2" />New Family Group
              </Button>
            )}
          </div>

          {loadingFamilies && <div className="flex justify-center py-12"><Loader className="h-6 w-6 animate-spin" /></div>}

          {!loadingFamilies && families.length === 0 && (
            <Card><CardContent className="py-12 text-center">
              <Heart className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">No family groups yet</p>
              {isAdmin && <p className="text-sm text-gray-400 mt-1">Create the first family group to connect parishioners</p>}
            </CardContent></Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {families.map((family) => (
              <Card key={family.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openFamilyDetail(family)}>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-rose-100 p-2 rounded-lg">
                        <Heart className="h-5 w-5 text-rose-600" />
                      </div>
                      <div>
                        <p className="font-semibold">{family.name}</p>
                        <p className="text-xs text-gray-400">{family.member_count} member{family.member_count !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditingFamily(family); setFamilyForm({ name: family.name, description: family.description || '' }); setShowFamilyDialog(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => setDeletingFamily(family)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {family.description && <p className="text-sm text-gray-500 line-clamp-2 mb-3">{family.description}</p>}
                  <div className="flex items-center justify-between pt-3 border-t">
                    <p className="text-xs text-gray-400">Created by {family.created_by_name}</p>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── MINISTRIES TAB ────────────────────────────────────────────── */}
        <TabsContent value="ministries" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Parish ministries and service groups — join to get involved</p>
            {isAdmin && (
              <Button size="sm" onClick={() => { setEditingMinistry(null); setMinistryForm({ name: '', description: '', schedule: '', contact_name: '', contact_email: '' }); setShowMinistryDialog(true); }}>
                <Plus className="h-4 w-4 mr-2" />New Ministry
              </Button>
            )}
          </div>

          {loadingMinistries && <div className="flex justify-center py-12"><Loader className="h-6 w-6 animate-spin" /></div>}

          {!loadingMinistries && ministries.length === 0 && (
            <Card><CardContent className="py-12 text-center">
              <Church className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">No ministries yet</p>
              {isAdmin && <p className="text-sm text-gray-400 mt-1">Add parish ministries so members can join</p>}
            </CardContent></Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ministries.map((ministry) => (
              <Card key={ministry.id} className={`transition-shadow ${ministry.is_member ? 'border-blue-200 bg-blue-50/30' : 'hover:shadow-md'}`}>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-100 p-2 rounded-lg">
                        <Church className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-semibold">{ministry.name}</p>
                        <p className="text-xs text-gray-400">{ministry.member_count} member{ministry.member_count !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {ministry.is_member ? <Badge className="bg-blue-600 text-xs"><UserCheck className="h-3 w-3 mr-1" />Joined</Badge> : null}
                      {isAdmin && (
                        <div className="flex gap-1 ml-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditingMinistry(ministry); setMinistryForm({ name: ministry.name, description: ministry.description || '', schedule: ministry.schedule || '', contact_name: ministry.contact_name || '', contact_email: ministry.contact_email || '' }); setShowMinistryDialog(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => setDeletingMinistry(ministry)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {ministry.description && <p className="text-sm text-gray-600 mb-3 line-clamp-2">{ministry.description}</p>}

                  <div className="space-y-1 mb-4">
                    {ministry.schedule && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />{ministry.schedule}
                      </div>
                    )}
                    {ministry.contact_name && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Users className="h-3.5 w-3.5 shrink-0" />Contact: {ministry.contact_name}
                        {ministry.contact_email && <a href={`mailto:${ministry.contact_email}`} className="text-blue-500 hover:underline" onClick={(e) => e.stopPropagation()}>{ministry.contact_email}</a>}
                      </div>
                    )}
                  </div>

                  <Button size="sm" variant={ministry.is_member ? "outline" : "default"} className="w-full"
                    disabled={joiningMinistry === ministry.id} onClick={() => handleToggleMinistry(ministry)}>
                    {joiningMinistry === ministry.id
                      ? <Loader className="h-4 w-4 animate-spin mr-2" />
                      : ministry.is_member
                        ? <><UserCheck className="h-4 w-4 mr-2" />Leave Ministry</>
                        : <><Plus className="h-4 w-4 mr-2" />Join Ministry</>}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
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
              <Input id="name" placeholder="Enter full name" value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })} disabled={isSubmitting} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input id="email" type="email" placeholder="user@example.com" value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })} disabled={isSubmitting} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <Input id="password" type="password" placeholder="Min. 8 characters" value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })} disabled={isSubmitting} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })} disabled={isSubmitting}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="parishioner">Parishioner</SelectItem>
                  {isSuperAdmin && <SelectItem value="admin">Administrator</SelectItem>}
                  {isSuperAdmin && <SelectItem value="superadmin">Super Administrator</SelectItem>}
                </SelectContent>
              </Select>
              {formData.role === "superadmin" && (
                <p className="text-sm text-amber-600 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />This user will have full admin privileges.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={isSubmitting}>Cancel</Button>
            <Button onClick={handleCreateMember} disabled={isSubmitting}>
              {isSubmitting ? <><Loader className="h-4 w-4 mr-2 animate-spin" />Creating...</> : "Create Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Family Group Create/Edit Dialog */}
      <Dialog open={showFamilyDialog} onOpenChange={setShowFamilyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFamily ? 'Edit Family Group' : 'New Family Group'}</DialogTitle>
            <DialogDescription>Group related parishioners into a family unit</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Group Name *</Label>
              <Input placeholder="e.g. Dela Cruz Family" value={familyForm.name}
                onChange={(e) => setFamilyForm({ ...familyForm, name: e.target.value })} disabled={isSubmitting} />
            </div>
            <div className="space-y-2">
              <Label>Description <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
              <Textarea placeholder="Brief description of this family group..." value={familyForm.description}
                onChange={(e) => setFamilyForm({ ...familyForm, description: e.target.value })} disabled={isSubmitting} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFamilyDialog(false)} disabled={isSubmitting}>Cancel</Button>
            <Button onClick={handleSaveFamily} disabled={isSubmitting}>
              {isSubmitting ? <Loader className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingFamily ? 'Save Changes' : 'Create Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Family Group Detail Dialog */}
      <Dialog open={showFamilyDetail} onOpenChange={setShowFamilyDetail}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-rose-500" />{selectedFamily?.name}
            </DialogTitle>
            {selectedFamily?.description && <DialogDescription>{selectedFamily.description}</DialogDescription>}
          </DialogHeader>
          <div className="space-y-3 max-h-80 overflow-y-auto py-2">
            {(selectedFamily?.members || []).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No members yet</p>
            )}
            {(selectedFamily?.members || []).map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={m.avatar} alt={m.name} />
                  <AvatarFallback>{m.name?.[0] ?? '?'}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-gray-400">{RELATIONSHIP_LABELS[m.relationship] ?? m.relationship}</p>
                </div>
                {isAdmin && (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                    onClick={() => selectedFamily && handleRemoveFamilyMember(selectedFamily.id, m.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          {isAdmin && (
            <div className="border-t pt-4">
              {!showAddMember ? (
                <Button variant="outline" size="sm" className="w-full" onClick={() => setShowAddMember(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />Add Member
                </Button>
              ) : (
                <div className="space-y-3">
                  <Select value={addMemberForm.user_id} onValueChange={(v) => setAddMemberForm({ ...addMemberForm, user_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select member..." /></SelectTrigger>
                    <SelectContent>
                      {members.filter((m) => !(selectedFamily?.members || []).find((sm) => sm.id === m.id))
                        .map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={addMemberForm.relationship} onValueChange={(v) => setAddMemberForm({ ...addMemberForm, relationship: v })}>
                    <SelectTrigger><SelectValue placeholder="Relationship" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(RELATIONSHIP_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowAddMember(false)}>Cancel</Button>
                    <Button size="sm" className="flex-1" onClick={handleAddFamilyMember} disabled={isSubmitting}>
                      {isSubmitting ? <Loader className="h-4 w-4 animate-spin" /> : 'Add'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Ministry Create/Edit Dialog */}
      <Dialog open={showMinistryDialog} onOpenChange={setShowMinistryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMinistry ? 'Edit Ministry' : 'New Ministry'}</DialogTitle>
            <DialogDescription>Parish ministry or service group</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Ministry Name *</Label>
              <Input placeholder="e.g. Youth Ministry" value={ministryForm.name}
                onChange={(e) => setMinistryForm({ ...ministryForm, name: e.target.value })} disabled={isSubmitting} />
            </div>
            <div className="space-y-2">
              <Label>Description <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
              <Textarea placeholder="What does this ministry do?" value={ministryForm.description}
                onChange={(e) => setMinistryForm({ ...ministryForm, description: e.target.value })} disabled={isSubmitting} />
            </div>
            <div className="space-y-2">
              <Label>Schedule <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
              <Input placeholder="e.g. Every Sunday 8:00 AM" value={ministryForm.schedule}
                onChange={(e) => setMinistryForm({ ...ministryForm, schedule: e.target.value })} disabled={isSubmitting} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Contact Name <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
                <Input placeholder="Coordinator name" value={ministryForm.contact_name}
                  onChange={(e) => setMinistryForm({ ...ministryForm, contact_name: e.target.value })} disabled={isSubmitting} />
              </div>
              <div className="space-y-2">
                <Label>Contact Email <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
                <Input type="email" placeholder="email@parish.com" value={ministryForm.contact_email}
                  onChange={(e) => setMinistryForm({ ...ministryForm, contact_email: e.target.value })} disabled={isSubmitting} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMinistryDialog(false)} disabled={isSubmitting}>Cancel</Button>
            <Button onClick={handleSaveMinistry} disabled={isSubmitting}>
              {isSubmitting ? <Loader className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingMinistry ? 'Save Changes' : 'Create Ministry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Family Confirm */}
      <AlertDialog open={!!deletingFamily} onOpenChange={() => setDeletingFamily(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingFamily?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the family group and all its member associations. Members themselves are not deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFamily} disabled={isSubmitting} className="bg-red-600 hover:bg-red-700">
              {isSubmitting ? <Loader className="h-4 w-4 animate-spin mr-2" /> : null}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Ministry Confirm */}
      <AlertDialog open={!!deletingMinistry} onOpenChange={() => setDeletingMinistry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingMinistry?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the ministry and all member enrollments.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMinistry} disabled={isSubmitting} className="bg-red-600 hover:bg-red-700">
              {isSubmitting ? <Loader className="h-4 w-4 animate-spin mr-2" /> : null}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
