import React, { useState, useEffect } from "react";
import { useAuth, Permission } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import {
  Shield,
  UserPlus,
  Trash2,
  Edit,
  Search,
  Crown,
  ShieldCheck,
  User,
  Loader,
  AlertCircle,
  Wallet as WalletIcon,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import AdminWallet from "./AdminWallet";

interface AuditLog {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  ip_address: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: "superadmin" | "admin" | "parishioner";
  parishId?: string;
  avatar?: string;
  baptismDate?: string;
  created_at?: string;
  last_login?: string;
}

const API_BASE_URL = '/parish-connect/api';

export default function AdminManagement() {
  const { user: currentUser, hasPermission, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editName, setEditName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "parishioner" as string,
  });

  const canCreateAdmin = hasPermission(Permission.CREATE_ADMIN);
  const canDeleteAdmin = hasPermission(Permission.DELETE_ADMIN);
  const canDeleteUser = hasPermission(Permission.DELETE_USER);
  const canEditUser = hasPermission(Permission.EDIT_USER);
  const canViewAudit = hasPermission(Permission.VIEW_AUDIT_LOG);

  const getToken = () => localStorage.getItem('parish_token') || sessionStorage.getItem('parish_token');

  // ── Audit log state ────────────────────────────────────────────────────────
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditActions, setAuditActions] = useState<string[]>([]);
  const [auditFilterAction, setAuditFilterAction] = useState("");
  const [auditFilterFrom, setAuditFilterFrom] = useState("");
  const [auditFilterTo, setAuditFilterTo] = useState("");

  const fetchAuditLogs = async (page = 1) => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (auditFilterAction) params.set('action', auditFilterAction);
      if (auditFilterFrom) params.set('from', auditFilterFrom);
      if (auditFilterTo) params.set('to', auditFilterTo);
      const res = await fetch(`${API_BASE_URL}/audit?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        setAuditLogs(data.data.logs);
        setAuditTotal(data.data.total);
        setAuditPage(data.data.page);
        setAuditHasMore(data.data.hasMore);
        if (data.data.actions?.length) setAuditActions(data.data.actions);
      }
    } catch { toast.error('Failed to load audit logs'); }
    finally { setAuditLoading(false); }
  };

  const handleEditUser = async () => {
    if (!userToEdit) return;
    try {
      setIsSubmitting(true);
      const response = await fetch(`${API_BASE_URL}/users/${userToEdit.id}`, {
        method: "PUT",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ role: editRole, name: editName }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || "Failed to update user");
      toast.success("User updated successfully");
      setShowEditDialog(false);
      setUserToEdit(null);
      await fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (user: User) => {
    setUserToEdit(user);
    setEditRole(user.role);
    setEditName(user.name);
    setShowEditDialog(true);
  };

  const fetchUsers = async () => {
    try {
      setIsLoadingUsers(true);
      setError(null);
      const token = localStorage.getItem('parish_token') || sessionStorage.getItem('parish_token');
      const response = await fetch(`${API_BASE_URL}/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const json = await response.json();
      const result = json.data?.items || json.data || json || [];
      setUsers(Array.isArray(result) ? result : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load users";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleCreateUser = async () => {
    if (!formData.name || !formData.email || !formData.password) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setIsSubmitting(true);
      const token = localStorage.getItem('parish_token') || sessionStorage.getItem('parish_token');
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.message || "Failed to create user");
      }

      toast.success(`${formData.role === "admin" ? "Admin" : "Parishioner"} created successfully`);
      setShowCreateDialog(false);
      setFormData({ name: "", email: "", password: "", role: "parishioner" });
      await fetchUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create user";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      setIsSubmitting(true);
      const token = localStorage.getItem('parish_token') || sessionStorage.getItem('parish_token');
      const response = await fetch(`${API_BASE_URL}/users/${userToDelete.id}`, {
        method: "DELETE",
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.message || "Failed to delete user");
      }

      toast.success("User deleted successfully");
      setShowDeleteDialog(false);
      setUserToDelete(null);
      await fetchUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete user";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "superadmin":
        return <Crown className="h-4 w-4" />;
      case "admin":
        return <ShieldCheck className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "superadmin":
        return <Badge className="bg-purple-600"><Crown className="h-3 w-3 mr-1" />Super Admin</Badge>;
      case "admin":
        return <Badge className="bg-blue-600"><ShieldCheck className="h-3 w-3 mr-1" />Admin</Badge>;
      default:
        return <Badge variant="secondary"><User className="h-3 w-3 mr-1" />Parishioner</Badge>;
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-blue-50/30 to-transparent pt-20">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold">User Management</h1>
              <p className="text-gray-600">
                Manage parish administrators and parishioners
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="users" onValueChange={(v) => { if (v === 'audit' && auditLogs.length === 0) fetchAuditLogs(1); }}>
          <TabsList className="mb-6">
            <TabsTrigger value="users"><Shield className="h-4 w-4 mr-1.5" />Users</TabsTrigger>
            <TabsTrigger value="wallet"><WalletIcon className="h-4 w-4 mr-1.5" />GBless Wallet</TabsTrigger>
            {canViewAudit && <TabsTrigger value="audit"><ClipboardList className="h-4 w-4 mr-1.5" />Audit Log</TabsTrigger>}
          </TabsList>
          <TabsContent value="users">

            {/* Error State */}
            {error && (
              <Card className="mb-6 border-red-200 bg-red-50">
                <CardContent className="pt-6 flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                  <div>
                    <p className="text-red-900 font-medium">Failed to load users</p>
                    <p className="text-red-800 text-sm">{error}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchUsers}
                    className="ml-auto"
                  >
                    Retry
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    Total Users
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{users.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    Administrators
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {users.filter((u) => u.role === "admin").length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    Parishioners
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {users.filter((u) => u.role === "parishioner").length}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters and Actions */}
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by name or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-full md:w-[200px]">
                      <SelectValue placeholder="Filter by role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="admin">Admins</SelectItem>
                      <SelectItem value="parishioner">Parishioners</SelectItem>
                    </SelectContent>
                  </Select>
                  {(canCreateAdmin || canEditUser) && (
                    <Button onClick={() => setShowCreateDialog(true)}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add User
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Users Table */}
            <Card>
              <CardHeader>
                <CardTitle>Users ({filteredUsers.length})</CardTitle>
                <CardDescription>
                  Manage user accounts and permissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingUsers ? (
                  <div className="flex justify-center items-center py-12">
                    <Loader className="h-6 w-6 animate-spin" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-12">
                    <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No users found</p>
                    {searchQuery || roleFilter !== "all" && (
                      <p className="text-sm text-gray-500 mt-1">
                        Try adjusting your search criteria
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Member Since</TableHead>
                          <TableHead>Last Login</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div className="flex items-center space-x-3">
                                <Avatar>
                                  <AvatarImage src={user.avatar} alt={user.name} />
                                  <AvatarFallback>
                                    {getInitials(user.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium">{user.name}</p>
                                  {user.id === currentUser?.id && (
                                    <span className="text-xs text-gray-500">(You)</span>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-gray-600">
                              {user.email}
                            </TableCell>
                            <TableCell>{getRoleBadge(user.role)}</TableCell>
                            <TableCell className="text-sm text-gray-600">
                              {user.created_at
                                ? format(new Date(user.created_at), "MMM d, yyyy")
                                : "N/A"}
                            </TableCell>
                            <TableCell className="text-sm text-gray-600">
                              {user.last_login
                                ? format(new Date(user.last_login), "MMM d, yyyy")
                                : "Never"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end space-x-2">
                                {isSuperAdmin && user.id !== currentUser?.id && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditDialog(user)}
                                  >
                                    <Edit className="h-4 w-4 text-blue-600" />
                                  </Button>
                                )}
                                {user.id !== currentUser?.id &&
                                  ((user.role === "admin" && canDeleteAdmin) ||
                                    (user.role === "parishioner" && canDeleteUser) ||
                                    (user.role === "superadmin" && isSuperAdmin)) && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setUserToDelete(user);
                                        setShowDeleteDialog(true);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4 text-red-600" />
                                    </Button>
                                  )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Create User Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New User</DialogTitle>
                  <DialogDescription>
                    Create a new user account for the parish community
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      placeholder="Enter full name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
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
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
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
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role *</Label>
                    <Select
                      value={formData.role}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          role: value,
                        })
                      }
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="parishioner">Parishioner</SelectItem>
                        {canCreateAdmin && (
                          <SelectItem value="admin">Administrator</SelectItem>
                        )}
                        {currentUser?.role === "superadmin" && (
                          <SelectItem value="superadmin">Super Administrator</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {formData.role === "admin" && (
                      <p className="text-sm text-amber-600 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Admins have elevated permissions
                      </p>
                    )}
                    {formData.role === "superadmin" && (
                      <p className="text-sm text-amber-600 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        This user will have full admin privileges but cannot modify the parent super admin account.
                      </p>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateDialog(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleCreateUser} disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create User"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete User</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete <strong>{userToDelete?.name}</strong>?
                    This action cannot be undone and will remove all associated data.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteUser}
                    disabled={isSubmitting}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader className="h-4 w-4 mr-2 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      "Delete User"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Edit User Dialog */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit User</DialogTitle>
                  <DialogDescription>
                    Update {userToEdit?.name}'s account details
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="editName">Full Name</Label>
                    <Input
                      id="editName"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editRole">Role</Label>
                    <Select
                      value={editRole}
                      onValueChange={setEditRole}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="parishioner">Parishioner</SelectItem>
                        <SelectItem value="admin">Administrator</SelectItem>
                        <SelectItem value="superadmin">Super Administrator</SelectItem>
                      </SelectContent>
                    </Select>
                    {editRole === "superadmin" && (
                      <p className="text-sm text-amber-600 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        This user will have full admin privileges
                      </p>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={isSubmitting}>
                    Cancel
                  </Button>
                  <Button onClick={handleEditUser} disabled={isSubmitting}>
                    {isSubmitting ? (
                      <><Loader className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>
          <TabsContent value="wallet">
            <AdminWallet />
          </TabsContent>

          {/* ── AUDIT LOG TAB ─────────────────────────────────────────────── */}
          {canViewAudit && (
            <TabsContent value="audit" className="space-y-4">
              {/* Filters */}
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500">Action</label>
                      <Select value={auditFilterAction || "all"} onValueChange={(v) => setAuditFilterAction(v === 'all' ? '' : v)}>
                        <SelectTrigger className="w-48 h-9"><SelectValue placeholder="All actions" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All actions</SelectItem>
                          {auditActions.map((a) => <SelectItem key={a} value={a}>{a.replace(/_/g, ' ')}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500">From</label>
                      <Input type="date" className="h-9 w-40" value={auditFilterFrom} onChange={(e) => setAuditFilterFrom(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500">To</label>
                      <Input type="date" className="h-9 w-40" value={auditFilterTo} onChange={(e) => setAuditFilterTo(e.target.value)} />
                    </div>
                    <Button size="sm" onClick={() => fetchAuditLogs(1)} disabled={auditLoading}>
                      <Filter className="h-4 w-4 mr-2" />Apply
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setAuditFilterAction(''); setAuditFilterFrom(''); setAuditFilterTo(''); setTimeout(() => fetchAuditLogs(1), 0); }}>
                      Clear
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{auditTotal.toLocaleString()} total entries</p>
                </CardContent>
              </Card>

              {/* Table */}
              <Card>
                <CardContent className="p-0">
                  {auditLoading ? (
                    <div className="flex justify-center py-12"><Loader className="h-6 w-6 animate-spin" /></div>
                  ) : auditLogs.length === 0 ? (
                    <div className="text-center py-12">
                      <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">No audit log entries found</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b bg-gray-50">
                          <tr>
                            <th className="text-left px-4 py-3 font-medium text-gray-600">When</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-600">Target</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-600">IP</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {auditLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 whitespace-nowrap">
                                <p className="text-xs text-gray-500">{format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}</p>
                                <p className="text-xs text-gray-400">{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</p>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium">{log.user_name ?? <span className="text-gray-400 italic">system</span>}</p>
                                {log.user_email && <p className="text-xs text-gray-400">{log.user_email}</p>}
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="secondary" className="font-mono text-xs">
                                  {log.action.replace(/_/g, ' ')}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500">
                                {log.target_name
                                  ? <><span className="font-medium text-gray-700">{log.target_name}</span><br /><span className="text-gray-400">{log.target_type}</span></>
                                  : log.target_type ?? '—'}
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-400 font-mono">{log.ip_address ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Pagination */}
              {auditTotal > 50 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">Page {auditPage} of {Math.ceil(auditTotal / 50)}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={auditPage <= 1 || auditLoading} onClick={() => fetchAuditLogs(auditPage - 1)}>
                      <ChevronLeft className="h-4 w-4" />Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={!auditHasMore || auditLoading} onClick={() => fetchAuditLogs(auditPage + 1)}>
                      Next<ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
