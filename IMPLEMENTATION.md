# Parish Connect - Implementation Guide

## Overview
Parish Connect is a faith-centered social platform that connects parishioners through baptismal records and parish membership. Built with React, TypeScript, React Router v7, and Tailwind CSS.

## Authentication & Logout Flow

### Login Process
1. User enters credentials on the login page
2. AuthContext validates credentials against mock user database
3. User data is stored in localStorage for session persistence
4. User is redirected to the Feed page

### Logout Process (Following Best Practices)

The logout functionality implements industry best practices:

#### 1. **Confirmation Dialog**
- Prevents accidental logouts with an AlertDialog
- Clear messaging about the action consequences
- Two-step process: Click logout → Confirm action

#### 2. **Multiple Access Points**
- Desktop: User avatar dropdown menu → Logout option
- Mobile: Hamburger menu → Logout button
- Both routes lead to the same confirmation dialog

#### 3. **Visual Feedback**
- Logout option styled in red to indicate destructive action
- Success toast notification upon logout
- Immediate UI update showing login screen

#### 4. **Complete Session Cleanup**
```typescript
const logout = () => {
  // Clear user state
  setUser(null);
  // Clear localStorage
  localStorage.removeItem("parish_user");
  // Clear any other cached data
  localStorage.removeItem("parish_cache");
};
```

#### 5. **Error Handling**
- Corrupted localStorage data is handled gracefully
- Try-catch blocks prevent app crashes
- Automatic cleanup on data corruption

## Component Architecture

### Core Components

#### AuthContext (`/src/app/context/AuthContext.tsx`)
- Manages authentication state
- Provides login/logout functions
- Handles localStorage persistence
- Exports `useAuth()` hook for components

#### Layout (`/src/app/components/Layout.tsx`)
- Wraps all authenticated routes
- Shows Login page if not authenticated
- Includes Navbar and Toaster components

#### Navbar (`/src/app/components/Navbar.tsx`)
- Sticky navigation bar
- Responsive design (desktop/mobile)
- User dropdown with logout option
- Logout confirmation dialog

### Page Components

1. **Feed** - Social feed with posts, likes, comments
2. **Profile** - User profiles with timeline view
3. **ParishRecords** - Searchable baptismal records database
4. **Membership** - Parish member directory
5. **Settings** - User preferences and security

## Best Practices Implemented

### 1. Security
- No sensitive data in code (uses mock data for demo)
- Clear separation of auth logic
- Proper session cleanup on logout
- Error boundary for corrupted data

### 2. User Experience
- Confirmation dialogs for destructive actions
- Toast notifications for feedback
- Loading states during authentication
- Responsive design for all screen sizes

### 3. Code Organization
- Component-driven architecture
- Separation of concerns (context, components, pages)
- Reusable UI components from Radix UI
- TypeScript for type safety

### 4. State Management
- Context API for global auth state
- Local state for component-specific data
- localStorage for session persistence
- No prop drilling

### 5. Routing
- React Router v7 with Data mode
- Nested routes for clean URLs
- Protected routes via Layout component
- 404 page for invalid routes

## Demo Credentials

### Admin Account
- Email: `admin@parish.com`
- Role: Parish administrator
- Access: Full permissions

### Parishioner Account
- Email: `user@parish.com`
- Role: Regular parishioner
- Access: Standard member permissions

**Note:** Any password works for demo purposes

## Key Features

### Faith-Centered Feed
- Posts categorized by type (community, events, baptism anniversaries, research)
- Like and comment functionality
- Real-time filtering by category
- Create posts with event metadata

### Parish Records
- Searchable baptismal records
- Verified record status
- Detailed record view with full information
- Privacy controls for sensitive data
- Admin-only export functionality

### Membership Directory
- Member profiles with photos
- Family group connections
- Ministry involvement tracking
- Active/pending status indicators
- Search and filter capabilities

### Profile Management
- Faith journey timeline
- Baptism and milestone tracking
- Family lineage display
- Posts and research projects
- Follow/follower system

### Settings & Privacy
- Profile customization
- Privacy controls
- Notification preferences
- Password management
- Admin-specific settings

## Future Enhancements

With a real backend (e.g., Supabase), you could add:
- Real authentication with email verification
- Database persistence for posts and records
- Real-time updates using subscriptions
- Photo upload for posts and profiles
- Direct messaging between parishioners
- Event calendar with RSVP
- Collaborative family tree building
- Document scanning for parish records
- Role-based access control (RBAC)
- Activity logs and audit trails

## Technical Stack

- **Framework:** React 18.3.1
- **Routing:** React Router 7.13.0
- **Styling:** Tailwind CSS 4.1.12
- **UI Components:** Radix UI
- **Icons:** Lucide React
- **Animations:** Motion (Framer Motion)
- **Forms:** React Hook Form
- **Date Handling:** date-fns
- **Notifications:** Sonner (toast)
- **Build Tool:** Vite 6.3.5

## Running the Application

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## File Structure

```
src/app/
├── context/
│   └── AuthContext.tsx          # Authentication state management
├── components/
│   ├── Layout.tsx               # Main layout wrapper
│   ├── Login.tsx                # Login form
│   ├── Navbar.tsx               # Navigation bar with logout
│   └── ui/                      # Reusable UI components
├── pages/
│   ├── Feed.tsx                 # Social feed
│   ├── Profile.tsx              # User profiles
│   ├── ParishRecords.tsx        # Records database
│   ├── Membership.tsx           # Member directory
│   ├── Settings.tsx             # User settings
│   └── NotFound.tsx             # 404 page
├── routes.tsx                   # Route configuration
└── App.tsx                      # Root component
```

## Best Practices Checklist

✅ Component-driven architecture  
✅ Context API for authentication  
✅ Protected routes implementation  
✅ Confirmation for destructive actions  
✅ User feedback via toast notifications  
✅ Responsive design (mobile-first)  
✅ TypeScript for type safety  
✅ Clean code separation  
✅ Reusable UI components  
✅ Error handling and validation  
✅ Loading states  
✅ Accessibility considerations  
✅ SEO-friendly routing  
✅ Mock data for demonstration  

## Notes

- This is a demo application with mock data
- Not designed for production use with real PII
- For production deployment, integrate with a secure backend
- Implement proper authentication (OAuth, JWT, etc.)
- Add database with encryption for sensitive records
- Follow GDPR/privacy regulations for church data
- Regular security audits recommended
