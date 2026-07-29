import type { SignUpFormData } from '@/types/user';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export type PasswordRequirement = {
  key: string;
  label: string;
  met: boolean;
};

/**
 * Purpose: Evaluates password rules for live form feedback.
 * How it works: 1) tests uppercase, lowercase, and special-character patterns. 2) returns labeled results.
 * Technologies Used: TypeScript and regular expressions.
 * Why this implementation: Structured results support both validation logic and accessible requirement displays.
 */
export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    { key: 'upper', label: '1 uppercase letter', met: /[A-Z]/.test(password) },
    { key: 'lower', label: '1 lowercase letter', met: /[a-z]/.test(password) },
    { key: 'special', label: '1 special character', met: /[^A-Za-z0-9]/.test(password) },
  ];
}

/**
 * Purpose: Determines whether a password satisfies all configured requirements.
 * How it works: 1) evaluates requirement objects. 2) confirms every result is met.
 * Technologies Used: TypeScript and JavaScript array methods.
 * Why this implementation: Reusing the display requirements prevents validation rules from diverging.
 */
export function isPasswordValid(password: string): boolean {
  return getPasswordRequirements(password).every((requirement) => requirement.met);
}

/**
 * Purpose: Validates that an email is present and structurally plausible.
 * How it works: 1) trims whitespace. 2) checks required input. 3) applies the email pattern.
 * Technologies Used: TypeScript and regular expressions.
 * Why this implementation: Lightweight client validation catches common mistakes before Firebase requests.
 */
export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Email is required.';
  if (!EMAIL_REGEX.test(trimmed)) return 'Please enter a valid email address.';
  return null;
}

/**
 * Purpose: Validates a required password and returns user-facing feedback.
 * How it works: 1) checks presence. 2) delegates rule evaluation. 3) returns the first error or null.
 * Technologies Used: TypeScript and shared password validation.
 * Why this implementation: A single message keeps login and registration feedback consistent.
 */
export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required.';
  if (!isPasswordValid(password)) {
    return 'Password must include 1 uppercase letter, 1 lowercase letter, and 1 special character.';
  }
  return null;
}

/**
 * Purpose: Validates all fields required to create an EcoBantay account.
 * How it works: 1) checks identity/contact fields. 2) validates email/password. 3) confirms matching passwords.
 * Technologies Used: TypeScript form models and shared validators.
 * Why this implementation: Returning the first actionable issue keeps registration feedback focused.
 */
export function validateSignUpForm(form: SignUpFormData): string | null {
  if (!form.firstName.trim()) return 'First name is required.';
  if (!form.lastName.trim()) return 'Last name is required.';
  if (!form.hasSelectedDate) return 'Birthday is required.';
  if (!form.contactNumber.trim()) return 'Contact number is required.';

  const emailError = validateEmail(form.email);
  if (emailError) return emailError;

  const passwordError = validatePassword(form.password);
  if (passwordError) return passwordError;

  if (form.password !== form.confirmPassword) {
    return 'Passwords do not match.';
  }

  return null;
}

/**
 * Purpose: Validates credentials before an email login request.
 * How it works: 1) validates the email. 2) requires a password. 3) returns null when ready.
 * Technologies Used: TypeScript and shared email validation.
 * Why this implementation: Client-side checks avoid unnecessary authentication calls for incomplete input.
 */
export function validateLoginForm(email: string, password: string): string | null {
  const emailError = validateEmail(email);
  if (emailError) return emailError;
  if (!password) return 'Password is required.';
  return null;
}
