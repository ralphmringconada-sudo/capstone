/** Shared role and document shapes used by the admin dashboard. */
export type AdminRole = 'admin' | 'super_admin';

export type AdminProfile = {
  uid: string;
  fullName: string;
  email: string;
  contactNumber: string;
  username: string;
  role: AdminRole;
  status: 'active' | 'inactive';
  createdAt: string;
  createdBy?: string;
  isFlagged?: boolean;
  flaggedAt?: string | null;
  flaggedBy?: string | null;
};

export type AppUser = {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  birthday: string;
  authProvider: 'email' | 'google';
  createdAt: string;
  isFlagged?: boolean;
  flaggedAt?: string | null;
  flaggedBy?: string | null;
};

export type ReportStatus = 'Pending' | 'In Review' | 'Resolved' | 'Rejected';

export type ReportStatusHistoryEntry = {
  status: ReportStatus;
  at: string;
  by?: string;
  byName?: string;
  remarks?: string;
};

export type Report = {
  id: string;
  title: string;
  description: string;
  location: string;
  category: string;
  reportedByUid: string;
  reportedByName: string;
  reportedByEmail?: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt?: string;
  statusHistory?: ReportStatusHistoryEntry[];
  images?: string[];
  imagePaths?: string[];
  urgent?: boolean;
  coordinates?: { latitude: number; longitude: number };
  imageTimestamp?: string;
  imageLocation?: string;
  city?: string;
  barangay?: string;
  imageMetadata?: Record<string, unknown>;
};

export type EventParticipant = {
  uid: string;
  name: string;
  email: string;
  joinedAt: string;
};

export type AdminEvent = {
  id: string;
  title: string;
  description: string;
  category: string;
  date: string;
  time: string;
  location: string;
  status: 'Pending' | 'Upcoming' | 'Ongoing' | 'Completed' | 'Rejected';
  participants: number;
  capacity: number;
  submittedBy: string;
  submittedArea: string;
  submittedByUid?: string;
  imageUrl?: string;
  coordinates?: { latitude: number; longitude: number };
  createdAt: string;
  updatedAt?: string;
};

export type ActivityLog = {
  id: string;
  adminUid: string;
  adminName: string;
  action: string;
  module: string;
  recordId: string;
  details: string;
  createdAt: string;
};
