export type ReportStatus = 'Pending' | 'In Review' | 'Resolved' | 'Rejected';

export type ReportCoordinates = {
  latitude: number;
  longitude: number;
};

export type ReportImageMetadata = {
  capturedAt: string;
  capturedAtIso: string;
  locationText: string;
  coordinates: ReportCoordinates;
  city: string;
  barangay?: string;
  platform: string;
  accuracy?: number;
};

export type EcoReport = {
  id: string;
  title: string;
  description: string;
  location: string;
  category: string;
  categoryId: string;
  barangay?: string;
  city: string;
  reportedByUid: string;
  reportedByName: string;
  reportedByEmail?: string;
  status: ReportStatus;
  urgent?: boolean;
  createdAt: string;
  updatedAt?: string;
  imagePaths?: string[];
  images: string[];
  coordinates?: ReportCoordinates;
  imageTimestamp?: string;
  imageLocation?: string;
  imageMetadata?: ReportImageMetadata;
};

export type SubmitReportInput = {
  categoryId: string;
  categoryName: string;
  description: string;
  locationText: string;
  barangay: string;
  coordinates: ReportCoordinates;
  imageUri: string;
  photoTimestamp: string;
  imageMetadata: ReportImageMetadata;
  user: {
    uid: string;
    firstName: string;
    lastName: string;
    email: string;
  };
};
