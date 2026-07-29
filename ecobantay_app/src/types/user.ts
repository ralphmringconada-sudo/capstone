export type AuthProvider = 'email' | 'google';

export type UserProfile = {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  birthday: string;
  authProvider: AuthProvider;
  createdAt: string;
  updatedAt?: string;
};

export type SignUpFormData = {
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  password: string;
  confirmPassword: string;
  birthday: Date;
  hasSelectedDate: boolean;
};
