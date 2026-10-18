export const APPLICATION_ROLES = ["DOCTOR", "ADMINISTRATOR", "PATIENT"] as const;
export type ApplicationRole = (typeof APPLICATION_ROLES)[number];

export const DOCTOR_VERIFICATION_STATUSES = ["PENDING", "VERIFIED", "REJECTED"] as const;
export type DoctorVerificationStatus = (typeof DOCTOR_VERIFICATION_STATUSES)[number];

export const ACCOUNT_STATUSES = ["INVITED", "ACTIVE", "SUSPENDED", "INACTIVE"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const CONSULTATION_TYPES = ["ONLINE", "IN_PERSON"] as const;
export type ConsultationType = (typeof CONSULTATION_TYPES)[number];

export const APPOINTMENT_STATUSES = ["SCHEDULED", "CANCELLED", "COMPLETED", "NO_SHOW"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const CONSULTATION_PROGRESS = ["WAITING", "IN_PROGRESS", "COMPLETED"] as const;
export type ConsultationProgress = (typeof CONSULTATION_PROGRESS)[number];

export const NOTIFICATION_TARGET_TYPES = ["APPOINTMENT", "CONSULTATION", "MESSAGE", "VERIFICATION", "DOCTOR_VERIFICATION", "ACCOUNT", "AVAILABILITY", "SCHEDULE", "REPORT", "SETTINGS", "OPERATIONAL_ISSUE"] as const;
export type NotificationTargetType = (typeof NOTIFICATION_TARGET_TYPES)[number];

export type ApiError = {
  code: string;
  parameters?: Record<string, string | number | boolean>;
  requestId: string;
};

export type AuthorizedSession = {
  userId: string;
  role: ApplicationRole;
  accountStatus: AccountStatus;
  verificationStatus?: DoctorVerificationStatus;
  displayName: string;
};
