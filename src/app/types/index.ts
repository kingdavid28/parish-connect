// User & Authentication Types
export type UserRole = "superadmin" | "admin" | "parishioner";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  parishId: string;
  avatar?: string;
  baptismDate?: string;
  memberSince?: string;
  createdBy?: string;
  lastLogin?: string;
  bio?: string;
  phone?: string;
  address?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

// Parish Records Types
export interface BaptismalRecord {
  id: string;
  childName: string;
  baptismDate: string;
  birthDate: string;
  fatherName: string;
  motherName: string;
  godparent1: string;
  godparent2?: string;
  minister: string;
  parishId: string;
  bookNumber: string;
  pageNumber: string;
  verified: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConfirmationRecord {
  id: string;
  personName: string;
  confirmationDate: string;
  sponsor: string;
  minister: string;
  parishId: string;
  baptismalRecordId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarriageRecord {
  id: string;
  groomName: string;
  brideName: string;
  marriageDate: string;
  minister: string;
  parishId: string;
  witnesses: string[];
  createdAt: string;
  updatedAt: string;
}

// Social Feed Types
export type PostType = "announcement" | "event" | "prayer" | "milestone" | "general";

export interface Post {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  userRole: UserRole;
  type: PostType;
  content: string;
  images?: string[];
  timestamp: string;
  likes: number;
  likedBy: string[];
  comments: Comment[];
  isPinned?: boolean;
  isApproved?: boolean;
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  timestamp: string;
}

// Membership Types
export interface Member {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  role: UserRole;
  status: "active" | "inactive" | "pending";
  familyGroup?: string;
  ministries: string[];
  memberSince: string;
  baptismDate?: string;
  confirmationDate?: string;
  parishId: string;
}

// Settings Types
export interface NotificationSettings {
  email: boolean;
  push: boolean;
  baptismAnniversaries: boolean;
  parishEvents: boolean;
  prayerRequests: boolean;
  familyUpdates: boolean;
}

export interface PrivacySettings {
  profileVisibility: "public" | "parishioners" | "private";
  showEmail: boolean;
  showPhone: boolean;
  showBirthDate: boolean;
  showFamilyConnections: boolean;
}

export interface UserSettings {
  notifications: NotificationSettings;
  privacy: PrivacySettings;
}

// Timeline & Family Types
export interface TimelineEvent {
  id: string;
  userId: string;
  type: "baptism" | "confirmation" | "marriage" | "anniversary" | "milestone";
  title: string;
  date: string;
  description?: string;
  relatedUsers?: string[];
  attachments?: string[];
}

export interface FamilyConnection {
  id: string;
  userId: string;
  relatedUserId: string;
  relationship: "parent" | "child" | "spouse" | "sibling" | "godparent" | "godchild";
  verified: boolean;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Form Types
export interface LoginFormData {
  email: string;
  password: string;
}

export interface CreateUserFormData {
  name: string;
  email: string;
  role: "admin" | "parishioner";
  parishId: string;
}

export interface UpdateProfileFormData {
  name: string;
  email: string;
  phone?: string;
  bio?: string;
  avatar?: string;
}

// Permission enum lives in AuthContext to avoid duplication
export type { Permission } from "../context/AuthContext";

// Utility Types
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type AsyncData<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};
