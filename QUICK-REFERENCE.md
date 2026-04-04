# Parish Connect - Quick Reference Card

Quick reference for common patterns and best practices in the codebase.

---

## 📁 Project Structure

```
src/app/
├── components/          # Reusable components
│   ├── ui/             # shadcn UI components (46)
│   ├── ErrorBoundary.tsx
│   ├── LoadingState.tsx
│   └── DeleteButton.tsx
├── context/            # React Context providers
│   └── AuthContext.tsx
├── hooks/              # Custom React hooks (15+)
│   ├── useAsync.ts
│   └── index.ts
├── pages/              # Route pages
├── services/           # API layer
│   └── api.ts
├── types/              # TypeScript definitions
│   └── index.ts
├── utils/              # Utilities
│   └── validation.ts
└── App.tsx             # Root component
```

---

## 🔐 Authentication

### Check if user is authenticated
```tsx
const { user, isAuthenticated } = useAuth();
```

### Check permissions
```tsx
const { hasPermission } = useAuth();

if (hasPermission(Permission.DELETE_USER)) {
  // Show delete button
}
```

### Logout
```tsx
const { logout } = useAuth();
logout(); // Clears localStorage and resets state
```

---

## 🎨 UI Components

### Buttons
```tsx
import { Button } from "./components/ui/button";

<Button>Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Cancel</Button>
<Button variant="ghost" size="sm">Small</Button>
<Button size="icon"><Icon /></Button>
```

### Dialogs & Alerts
```tsx
import { AlertDialog, AlertDialogTrigger, ... } from "./components/ui/alert-dialog";
import { DeleteButton } from "./components/DeleteButton";

// Quick delete confirmation
<DeleteButton
  itemName="user account"
  onConfirm={handleDelete}
/>

// Custom alert dialog
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button>Open</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Title</AlertDialogTitle>
      <AlertDialogDescription>Description</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleAction}>Confirm</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Cards
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./components/ui/card";

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    Content here
  </CardContent>
</Card>
```

### Forms
```tsx
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./components/ui/select";

<div className="space-y-2">
  <Label htmlFor="email">Email</Label>
  <Input
    id="email"
    type="email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
  />
</div>

<Select value={role} onValueChange={setRole}>
  <SelectTrigger>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="admin">Admin</SelectItem>
    <SelectItem value="parishioner">Parishioner</SelectItem>
  </SelectContent>
</Select>
```

### Notifications
```tsx
import { toast } from "sonner";

toast.success("Success message");
toast.error("Error message");
toast.info("Info message");
toast.warning("Warning message");
toast.loading("Loading...");
```

---

## 🔄 Loading States

```tsx
import { LoadingSpinner, PostSkeleton, EmptyState } from "./components/LoadingState";

// Spinner
{loading && <LoadingSpinner />}

// Skeleton loaders
{loading && <PostSkeleton count={3} />}
{loading && <CardSkeleton count={4} />}
{loading && <TableSkeleton rows={5} columns={4} />}

// Empty state
{!loading && data.length === 0 && (
  <EmptyState
    icon={InboxIcon}
    title="No data"
    description="Get started by adding something"
    action={<Button>Add Item</Button>}
  />
)}
```

---

## 🪝 Custom Hooks

### Async operations
```tsx
import { useAsync } from "./hooks/useAsync";

const { data, loading, error, execute } = useAsync(
  () => apiClient.get("/users"),
  { immediate: true }
);

// Manual execution
<Button onClick={() => execute()}>Refresh</Button>
```

### Local storage
```tsx
import { useLocalStorage } from "./hooks";

const [settings, setSettings, clearSettings] = useLocalStorage("settings", defaultSettings);
```

### Debounced search
```tsx
import { useDebounce } from "./hooks";

const [search, setSearch] = useState("");
const debouncedSearch = useDebounce(search, 500);

useEffect(() => {
  // API call with debounced value
  searchApi(debouncedSearch);
}, [debouncedSearch]);
```

### Media queries
```tsx
import { useMediaQuery } from "./hooks";

const isMobile = useMediaQuery("(max-width: 768px)");
const isDesktop = useMediaQuery("(min-width: 1024px)");
```

### Form state
```tsx
import { useForm } from "./hooks";

const { values, errors, touched, handleChange, handleBlur, reset } = useForm({
  email: "",
  name: "",
});

<Input
  value={values.email}
  onChange={(e) => handleChange("email", e.target.value)}
  onBlur={() => handleBlur("email")}
/>
{touched.email && errors.email && <span>{errors.email}</span>}
```

### Toggle state
```tsx
import { useToggle } from "./hooks";

const [isOpen, toggleOpen, setOpen] = useToggle(false);

<Button onClick={toggleOpen}>Toggle</Button>
<Button onClick={() => setOpen(true)}>Open</Button>
```

---

## ✅ Validation

### Validate form
```tsx
import { validateForm, validators, commonValidationSchemas } from "./utils/validation";

// Using pre-built schema
const { isValid, errors } = validateForm(formData, commonValidationSchemas.login);

// Custom schema
const { isValid, errors } = validateForm(formData, {
  email: [validators.required("Email"), validators.email],
  name: [validators.required("Name"), validators.minLength(2)],
  password: [validators.required("Password"), validators.minLength(6)],
});

if (!isValid) {
  // Handle errors
  Object.entries(errors).forEach(([field, error]) => {
    toast.error(`${field}: ${error}`);
  });
  return;
}
```

### Available validators
```tsx
validators.required(fieldName)
validators.email
validators.phone
validators.url
validators.date
validators.pastDate
validators.futureDate
validators.number
validators.minLength(min)
validators.maxLength(max)
validators.min(min)
validators.max(max)
validators.pattern(regex, message)
validators.match(otherValue, fieldName)
validators.oneOf(allowedValues, fieldName)
```

### Sanitize input
```tsx
import { sanitizeInput, sanitizeHtml } from "./utils/validation";

const safe = sanitizeInput(userInput);
const safeHtml = sanitizeHtml(htmlContent);
```

---

## 🌐 API Calls

### Basic usage
```tsx
import { apiClient, withLoading, createMockResponse } from "./services/api";
import type { User, ApiResponse } from "./types";

// GET request
const response = await apiClient.get<User[]>("/users");

// POST request
const response = await apiClient.post<User>("/users", userData);

// With loading helper
const { data, error } = await withLoading(() =>
  apiClient.get<User[]>("/users")
);

// Mock data for development
const mockResponse = await createMockResponse(mockData, 500);
```

### With useAsync hook
```tsx
const { data, loading, error } = useAsync(
  () => apiClient.get<User[]>("/users")
);
```

---

## 🎯 TypeScript Types

```tsx
import type {
  User,
  UserRole,
  BaptismalRecord,
  Post,
  Member,
  ApiResponse,
  AsyncData,
  Permission,
} from "./types";

// Use in components
const [user, setUser] = useState<User | null>(null);
const [posts, setPosts] = useState<Post[]>([]);
const [asyncData, setAsyncData] = useState<AsyncData<User>>({
  data: null,
  loading: false,
  error: null,
});
```

---

## 🛡️ Error Handling

### Wrap components
```tsx
import { ErrorBoundary } from "./components/ErrorBoundary";

<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>

// Custom fallback
<ErrorBoundary fallback={<CustomErrorUI />}>
  <YourComponent />
</ErrorBoundary>
```

### Try-catch pattern
```tsx
try {
  const result = await apiClient.post("/users", data);
  toast.success("User created");
} catch (error) {
  if (error instanceof ApiError) {
    toast.error(error.message);
  } else {
    toast.error("An unexpected error occurred");
  }
}
```

---

## 🎨 Styling

### Tailwind classes
```tsx
// Layout
"flex items-center justify-between"
"grid grid-cols-1 md:grid-cols-3 gap-6"

// Spacing
"px-4 py-8"
"space-y-4"
"gap-4"

// Typography
"text-lg font-semibold text-gray-900"
"text-sm text-gray-600"

// Colors
"bg-blue-600 hover:bg-blue-700"
"text-red-600"

// Responsive
"hidden md:block"
"w-full md:w-1/2"
```

### cn() utility
```tsx
import { cn } from "./components/ui/utils";

<div className={cn(
  "base-classes",
  isActive && "active-classes",
  error && "error-classes",
  className // Pass through custom classes
)} />
```

---

## 🔒 Permissions

```tsx
import { Permission } from "./types";

Permission.VIEW_ALL_USERS
Permission.CREATE_ADMIN
Permission.EDIT_USER
Permission.DELETE_USER
Permission.DELETE_ADMIN
Permission.VIEW_RECORDS
Permission.CREATE_RECORD
Permission.EDIT_RECORD
Permission.DELETE_RECORD
Permission.EXPORT_RECORDS
Permission.DELETE_POST
Permission.PIN_POST
Permission.MANAGE_PARISH_SETTINGS
Permission.VIEW_AUDIT_LOGS
```

---

## 📱 Responsive Design

```tsx
import { useMediaQuery, useWindowSize } from "./hooks";

const isMobile = useMediaQuery("(max-width: 768px)");
const { width, height } = useWindowSize();

return (
  <div className={cn(
    "flex",
    isMobile ? "flex-col" : "flex-row"
  )}>
    {/* Content */}
  </div>
);
```

---

## 🚀 Performance

### Memoization
```tsx
import { memo, useMemo, useCallback } from "react";

// Memoize component
export const PostCard = memo(({ post }) => {
  return <div>{post.content}</div>;
});

// Memoize expensive calculations
const sortedPosts = useMemo(() => {
  return posts.sort((a, b) => b.timestamp - a.timestamp);
}, [posts]);

// Memoize callbacks
const handleDelete = useCallback((id: string) => {
  deletePost(id);
}, [deletePost]);
```

### Lazy loading
```tsx
import { lazy, Suspense } from "react";
import { PageLoading } from "./components/LoadingState";

const Feed = lazy(() => import("./pages/Feed"));

<Suspense fallback={<PageLoading />}>
  <Feed />
</Suspense>
```

---

## 🧪 Testing (Setup Required)

### Component tests
```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { Login } from "./Login";

describe("Login", () => {
  it("renders login form", () => {
    render(<Login />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("validates email", () => {
    render(<Login />);
    const emailInput = screen.getByLabelText(/email/i);
    fireEvent.change(emailInput, { target: { value: "invalid" } });
    fireEvent.blur(emailInput);
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
  });
});
```

---

## 📚 Further Reading

- **IMPROVEMENTS-GUIDE.md** - Complete improvements documentation
- **IMPLEMENTATION.md** - Feature implementation details
- **RBAC-DOCUMENTATION.md** - Role-based access control guide
- **ALERT_DIALOG_USAGE.md** - Alert dialog usage examples

---

**Pro Tips:**
- Always use `cn()` utility for conditional classes
- Wrap async operations with `useAsync` for automatic loading states
- Use pre-built validation schemas for common forms
- Leverage skeleton loaders for better UX
- Check permissions before rendering admin features
- Sanitize all user input before rendering
- Use ErrorBoundary to catch runtime errors gracefully
