# Role-Based Access Control (RBAC) Documentation

## Overview
Parish Connect implements a comprehensive three-tier role-based access control system with Super Admin, Admin, and Parishioner roles.

## Role Hierarchy

### 1. Super Administrator (Invisible)
**Email:** `reycelrcentino@gmail.com` (Hardcoded - Cannot be changed)
**Visibility:** Hidden from all user lists except to themselves
**Description:** System-level administrator with complete control

**Permissions:**
- ✅ All permissions (inherits all possible permissions)
- ✅ Create Admin accounts
- ✅ Delete Admin accounts
- ✅ Delete any user account
- ✅ Manage all parish records (create, edit, delete, export)
- ✅ Delete any post (content moderation)
- ✅ Moderate comments
- ✅ View audit logs
- ✅ Manage parish settings
- ✅ View all users including other admins

**Key Features:**
- Cannot be deleted
- Hidden from regular users and admins
- Only visible in their own user list
- Full access to Admin Management page
- Can create/delete admin accounts

### 2. Administrator
**Example:** `admin@parish.com` (Father Michael O'Connor)
**Visibility:** Visible to parishioners and other admins (but not super admin identity)
**Description:** Parish staff with elevated permissions

**Permissions:**
- ✅ View all users (except super admin)
- ✅ Edit user profiles
- ✅ View parish records
- ✅ Create new records
- ✅ Edit existing records
- ✅ Delete records
- ✅ Export records
- ✅ Delete any post (content moderation)
- ✅ Moderate comments
- ✅ Manage parish settings

**Restrictions:**
- ❌ Cannot create admin accounts
- ❌ Cannot delete admin accounts
- ❌ Cannot see super admin in user lists
- ❌ Cannot view audit logs (super admin only)

**Key Features:**
- Access to "User Management" in navigation
- Can moderate content across the platform
- Manage baptismal and parish records
- Export records for administrative purposes
- Admin badge displayed on profile

### 3. Parishioner
**Example:** `user@parish.com` (Maria Rodriguez)
**Visibility:** Visible to all users
**Description:** Regular parish member

**Permissions:**
- ✅ View parish records
- ✅ Create posts on feed
- ✅ Like and comment on posts
- ✅ Delete own posts
- ✅ Edit own profile
- ✅ View member directory
- ✅ Search records

**Restrictions:**
- ❌ Cannot create/edit/delete parish records
- ❌ Cannot delete others' posts
- ❌ Cannot access user management
- ❌ Cannot export records
- ❌ Cannot see admin tools
- ❌ Cannot moderate content

**Key Features:**
- Full social features (feed, comments, likes)
- Search baptismal records
- View member directory
- Personal profile management
- Privacy controls for own data

## Permission System

### Permission Enum
```typescript
export enum Permission {
  // User Management
  VIEW_ALL_USERS = "view_all_users",
  CREATE_ADMIN = "create_admin",
  DELETE_ADMIN = "delete_admin",
  DELETE_USER = "delete_user",
  EDIT_USER = "edit_user",
  
  // Parish Records
  VIEW_RECORDS = "view_records",
  CREATE_RECORD = "create_record",
  EDIT_RECORD = "edit_record",
  DELETE_RECORD = "delete_record",
  EXPORT_RECORDS = "export_records",
  
  // Posts & Content
  DELETE_ANY_POST = "delete_any_post",
  MODERATE_COMMENTS = "moderate_comments",
  
  // Settings
  MANAGE_PARISH_SETTINGS = "manage_parish_settings",
  VIEW_AUDIT_LOG = "view_audit_log",
}
```

### Permission Matrix

| Permission | Super Admin | Admin | Parishioner |
|-----------|-------------|-------|-------------|
| VIEW_ALL_USERS | ✅ | ✅ | ❌ |
| CREATE_ADMIN | ✅ | ❌ | ❌ |
| DELETE_ADMIN | ✅ | ❌ | ❌ |
| DELETE_USER | ✅ | ❌ | ❌ |
| EDIT_USER | ✅ | ✅ | ❌ |
| VIEW_RECORDS | ✅ | ✅ | ✅ |
| CREATE_RECORD | ✅ | ✅ | ❌ |
| EDIT_RECORD | ✅ | ✅ | ❌ |
| DELETE_RECORD | ✅ | ✅ | ❌ |
| EXPORT_RECORDS | ✅ | ✅ | ❌ |
| DELETE_ANY_POST | ✅ | ✅ | ❌ |
| MODERATE_COMMENTS | ✅ | ✅ | ❌ |
| MANAGE_PARISH_SETTINGS | ✅ | ✅ | ❌ |
| VIEW_AUDIT_LOG | ✅ | ❌ | ❌ |

## Using Permissions in Code

### Check User Role
```typescript
import { useAuth } from "../context/AuthContext";

function MyComponent() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  
  // Check role
  if (isSuperAdmin) {
    // Super admin only features
  }
  
  if (isAdmin) {
    // Admin and super admin features
  }
}
```

### Check Specific Permission
```typescript
import { useAuth, Permission } from "../context/AuthContext";

function MyComponent() {
  const { hasPermission } = useAuth();
  
  // Check specific permission
  if (hasPermission(Permission.DELETE_ANY_POST)) {
    // Show delete button for any post
  }
  
  if (hasPermission(Permission.CREATE_ADMIN)) {
    // Show create admin button (super admin only)
  }
}
```

### Conditional Rendering
```tsx
{hasPermission(Permission.EXPORT_RECORDS) && (
  <Button>
    <Download className="h-4 w-4 mr-2" />
    Export Records
  </Button>
)}
```

### Access Control for Routes
```tsx
function AdminManagement() {
  const { hasPermission } = useAuth();
  
  if (!hasPermission(Permission.VIEW_ALL_USERS)) {
    return (
      <div>
        <h3>Access Denied</h3>
        <p>You don't have permission to access this page.</p>
      </div>
    );
  }
  
  // Page content
}
```

## Feature-Specific Access Control

### Feed (Posts)
- **All Users:** Can create posts, like, comment
- **Post Owner:** Can delete own posts
- **Admin/Super Admin:** Can delete any post (moderation)

```typescript
const canDeletePost = (post: Post) => {
  return post.author.id === user?.id || canDeleteAnyPost;
};
```

### Parish Records
- **All Users:** Can view and search records
- **Admin/Super Admin:** Can create, edit, delete, and export records

### User Management (`/admin`)
- **Parishioners:** No access (404 or access denied)
- **Admin:** Can view users, edit profiles (cannot create/delete admins)
- **Super Admin:** Full control - create admin, delete admin, manage all users

### Navigation
Navigation links are dynamically filtered based on role:
- **Feed, Records, Membership:** Visible to all
- **User Management:** Visible only to admins and super admin

## Security Best Practices Implemented

### 1. **Super Admin Invisibility**
```typescript
export function getAllUsers(currentUser: User | null): User[] {
  const allUsers = Object.values(MOCK_USERS);
  
  // Super admin can see everyone
  if (currentUser?.role === "superadmin") {
    return allUsers;
  }
  
  // Regular admins and users cannot see super admin
  return allUsers.filter(u => u.role !== "superadmin");
}
```

### 2. **Protected Deletion**
```typescript
export function deleteUser(email: string): boolean {
  if (email === SUPER_ADMIN_EMAIL) {
    return false; // Cannot delete super admin
  }
  if (MOCK_USERS[email]) {
    delete MOCK_USERS[email];
    return true;
  }
  return false;
}
```

### 3. **Permission Validation**
Every destructive action checks permissions before execution:
```typescript
if (formData.role === "admin" && !canCreateAdmin) {
  toast.error("You don't have permission to create admin users");
  return;
}
```

### 4. **Self-Protection**
Users cannot delete their own accounts:
```typescript
if (userToDelete.id === currentUser?.id) {
  toast.error("You cannot delete your own account");
  return;
}
```

### 5. **Audit Trail**
User actions track who performed them:
```typescript
const newUser: User = {
  // ...user data
  createdBy: currentUser?.id,
  lastLogin: new Date().toISOString(),
};
```

## Admin Management Features

### User Creation
- Form validation (email format, required fields)
- Duplicate email check
- Role selection (Admin/Parishioner)
- Warning for elevated permissions
- Success toast notification

### User Deletion
- Confirmation dialog before deletion
- Permission checks
- Self-deletion protection
- Super admin protection
- Success/error feedback

### User Statistics
Dashboard shows:
- Total users count
- Administrator count
- Parishioner count

### Search & Filter
- Search by name or email
- Filter by role (All/Admin/Parishioner)
- Real-time filtering

## Demo Credentials

### Super Admin (Hidden)
```
Email: reycelrcentino@gmail.com
Role: Super Administrator
Access: Complete system control
```

### Admin
```
Email: admin@parish.com
Role: Administrator  
Access: Parish management
```

### Parishioner
```
Email: user@parish.com
Role: Parishioner
Access: Standard member features
```

**Note:** Any password works in demo mode

## UI Indicators

### Role Badges
- **Super Admin:** Purple badge with crown icon
- **Admin:** Blue badge with shield icon
- **Parishioner:** Secondary gray badge with user icon

### Visual Hierarchy
- Super admin features: Purple accent
- Admin features: Blue accent
- User features: Standard gray

### Admin Settings
Admins see additional settings card in Settings page with quick links to:
- Manage Parish Members
- Configure Record Access
- View Activity Logs

## Future Backend Integration

When connecting to a real backend (e.g., Supabase):

### Database Schema
```sql
-- Users table with role
CREATE TABLE users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT CHECK (role IN ('superadmin', 'admin', 'parishioner')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);

-- Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Super admin can see all
CREATE POLICY "super_admin_view_all" ON users
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'superadmin');

-- Policy: Admins cannot see super admins
CREATE POLICY "admin_view_users" ON users
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'admin' 
    AND role != 'superadmin'
  );
```

### API Endpoints
- `POST /api/users` - Create user (permission check)
- `DELETE /api/users/:id` - Delete user (permission check)
- `PUT /api/users/:id` - Update user (permission check)
- `GET /api/users` - List users (filtered by role)
- `GET /api/audit-logs` - View logs (super admin only)

### Middleware
```typescript
// Permission middleware
const requirePermission = (permission: Permission) => {
  return async (req, res, next) => {
    const userRole = req.user.role;
    const permissions = ROLE_PERMISSIONS[userRole];
    
    if (!permissions.includes(permission)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    
    next();
  };
};
```

## Best Practices Summary

✅ **Principle of Least Privilege** - Users only get permissions they need  
✅ **Defense in Depth** - Multiple layers of permission checks  
✅ **Separation of Duties** - Clear role boundaries  
✅ **Audit Trail** - Track who did what  
✅ **Fail Secure** - Default to deny access  
✅ **User Feedback** - Clear error messages for denied actions  
✅ **Graceful Degradation** - Features hidden if no permission  
✅ **Immutable Super Admin** - Cannot be modified or deleted  
✅ **Self-Protection** - Users can't lock themselves out  
✅ **Validation** - All inputs validated before processing  

## Troubleshooting

### "Access Denied" Error
**Cause:** User lacks required permission  
**Solution:** Check role and permission matrix

### Cannot See Admin Panel
**Cause:** Not logged in as admin/super admin  
**Solution:** Login with admin credentials

### Cannot Create Admin
**Cause:** Not logged in as super admin  
**Solution:** Only super admin can create admins

### Super Admin Not Visible
**Cause:** By design for security  
**Solution:** This is intentional - super admin is hidden from lists

### Cannot Delete User
**Cause:** Insufficient permissions or trying to delete protected account  
**Solution:** Check role permissions and target user role
