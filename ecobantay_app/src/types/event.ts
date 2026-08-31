export type EventStatus = 'Pending' | 'Upcoming' | 'Ongoing' | 'Completed' | 'Rejected';

export type EventCoordinates = {
  latitude: number;
  longitude: number;
};

export type EcoEvent = {
  id: string;
  title: string;
  description: string;
  category: string;
  date: string;
  time: string;
  location: string;
  status: EventStatus;
  participants: number;
  capacity: number;
  submittedBy: string;
  submittedArea: string;
  submittedByUid?: string;
  /** Primary/cover image (first of images, kept for older clients). */
  imageUrl?: string;
  /** All event photo download URLs. */
  images?: string[];
  coordinates?: EventCoordinates;
  createdAt: string;
  updatedAt?: string;
};

export type EventParticipant = {
  uid: string;
  name: string;
  email: string;
  joinedAt: string;
};

export type SubmitEventInput = {
  title: string;
  description: string;
  category: string;
  date: string;
  time: string;
  location: string;
  barangay: string;
  capacity: number;
  coordinates: EventCoordinates;
  /** One or more local image URIs to upload (max 5). */
  imageUris?: string[];
  user: {
    uid: string;
    firstName: string;
    lastName: string;
    email: string;
  };
};

export type UpdateEventInput = {
  title: string;
  description: string;
  category: string;
  date: string;
  time: string;
  location: string;
  barangay: string;
  capacity: number;
  coordinates?: EventCoordinates;
};
