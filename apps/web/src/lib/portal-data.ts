import { cookies } from "next/headers";
import { APPOINTMENT_STATUSES, CONSULTATION_TYPES, DOCTOR_VERIFICATION_STATUSES } from "@carenow/contracts";
import { getApiOrigin } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppointmentRow = {
  id: string;
  patientId: string;
  patientName: string;
  initials: string;
  reason: string;
  date: string;
  startTime: string;
  endTime: string;
  consultationType: "ONLINE" | "IN_PERSON";
  location?: string;
  status: "SCHEDULED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
};

export type DoctorDashboardData = {
  upcomingCount: number;
  onlineCount: number;
  inPersonCount: number;
  completedThisWeek: number;
  appointments: AppointmentRow[];
};

export type DoctorPatientRow = {
  id: string;
  name: string;
  initials: string;
  appointmentsCount: number;
  lastVisitAt: string | null;
  nextAppointmentAt: string | null;
};

export type DoctorPatientDetail = {
  patient: { id: string; name: string; phone: string | null; initials: string };
  appointments: AppointmentRow[];
};

export type DailyJoinGrant = {
  appointmentId: string;
  roomUrl: string;
  token: string;
  userName: string;
  role: "DOCTOR";
  expiresAt: string;
};

export type DoctorAvailabilityRule = {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
};

export type AdminScheduleSlot = {
  id: string;
  doctorId: string;
  doctorName: string;
  consultationType: "ONLINE" | "IN_PERSON";
  clinicId: string | null;
  clinicName: string | null;
  startsAt: string;
  endsAt: string;
  status: "OPEN" | "BLOCKED" | "BOOKED";
};
export type AdminScheduleData = {
  doctors: Array<{ id: string; name: string; specialty: string; services: Array<"ONLINE" | "IN_PERSON"> }>;
  clinics: Array<{ doctorId: string; clinicId: string; name: string; isPrimary: boolean }>;
  items: AdminScheduleSlot[];
};
export type AdminClinicAssignmentData = {
  doctors: Array<{ id: string; name: string; specialty: string }>;
  clinics: Array<{ id: string; name: string; address: string; city: string; region: string }>;
  assignments: Array<{ doctorId: string; doctorName: string; specialty: string; clinicId: string; clinicName: string; address: string; city: string; region: string; isPrimary: boolean; assignedAt: string }>;
};
export type AdminClinicsData = { items: Array<{ id: string; name: string; address: string; city: string; region: string; countryCode: string; timeZone: string; isActive: boolean; assignedDoctors: number; createdAt: string; updatedAt: string }> };

export type VerificationRow = {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  submittedAt: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
};

export type AdminDashboardData = {
  pendingVerifications: number;
  scheduledToday: number;
  waiting: number;
  inProgress: number;
  completed: number;
  verifications: VerificationRow[];
  appointments: Array<{
    id: string;
    patientReference: string;
    doctorName: string;
    date: string;
    startTime: string;
    consultationType: "ONLINE" | "IN_PERSON";
    location?: string;
    status: AppointmentRow["status"];
  }>;
};

export type AdminAppointmentInfo = {
  id: string;
  patientReference: string;
  doctorId: string;
  doctorName: string;
  startsAt: string;
  endsAt: string;
  consultationType: "ONLINE" | "IN_PERSON";
  clinicName: string | null;
  clinicAddress: string | null;
  clinicCity: string | null;
  status: "SCHEDULED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  createdAt: string;
};
export type AdminAppointmentsData = {
  items: AdminAppointmentInfo[];
  doctors: Array<{ id: string; name: string }>;
};

export type DataResult<T> = { data: T; unavailable: false } | { data: null; unavailable: true };

export type ListRow = { id: string; label: string; detail: string; status: string; updatedAt: string; reference?: string };
export type AdminDoctorProfile = {
  id: string; displayName: string; email: string | null; phone: string | null; accountStatus: string;
  verificationStatus: string; specialty: string; biography: string; profilePhotoUrl: string | null; licenseNumber: string; licenseRegion: string;
  licenseExpiry: string; qualifications: string; experienceYears: number; languages: string[];
  services: Array<"ONLINE" | "IN_PERSON">; documents: Array<{ id: string; type: string; status: string; uploadedAt: string; signedUrl: string }>;
  createdAt: string; updatedAt: string;
};
export type SpecialtyRow = { id: string; name: string; isActive: boolean; doctorCount: number; photoUrl: string | null; createdAt: string; updatedAt: string };
export type SpecialtyOption = { id: string; name: string; photoUrl?: string | null };
export type PortalNotification = { id: string; title: string; body: string; createdAt: string; readAt: string | null; targetType: string; targetId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function apiGet<T>(path: string, validate: (value: unknown) => T | null): Promise<DataResult<T>> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { data: null, unavailable: true };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { data: null, unavailable: true };
    const cookieStore = await cookies();
    const response = await fetch(`${getApiOrigin()}${path}`, {
      headers: {
        authorization: `Bearer ${session.access_token}`,
        accept: "application/json",
        "x-request-locale": cookieStore.get("carenow_locale")?.value ?? "en",
      },
      cache: "no-store",
    });
    if (!response.ok) return { data: null, unavailable: true };
    const parsed = validate(await response.json() as unknown);
    return parsed ? { data: parsed, unavailable: false } : { data: null, unavailable: true };
  } catch {
    return { data: null, unavailable: true };
  }
}

function parseAppointment(value: unknown): AppointmentRow | null {
  if (!isRecord(value)) return null;
  const types = CONSULTATION_TYPES;
  const statuses = APPOINTMENT_STATUSES;
  if (
    typeof value.id !== "string" || typeof value.patientId !== "string" || typeof value.patientName !== "string" ||
    typeof value.initials !== "string" || typeof value.reason !== "string" ||
    typeof value.date !== "string" || typeof value.startTime !== "string" ||
    typeof value.endTime !== "string" || typeof value.consultationType !== "string" ||
    !types.includes(value.consultationType as (typeof CONSULTATION_TYPES)[number]) || typeof value.status !== "string" || !statuses.includes(value.status as (typeof APPOINTMENT_STATUSES)[number])
  ) return null;
  return {
    id: value.id, patientId: value.patientId, patientName: value.patientName, initials: value.initials,
    reason: value.reason, date: value.date, startTime: value.startTime,
    endTime: value.endTime, consultationType: value.consultationType as AppointmentRow["consultationType"],
    location: typeof value.location === "string" ? value.location : undefined,
    status: value.status as AppointmentRow["status"],
  };
}

function parseDoctorDashboard(value: unknown): DoctorDashboardData | null {
  if (!isRecord(value) || !Array.isArray(value.appointments)) return null;
  const appointments = value.appointments.map(parseAppointment);
  if (appointments.some((row) => row === null)) return null;
  const numbers = [value.upcomingCount, value.onlineCount, value.inPersonCount, value.completedThisWeek];
  if (!numbers.every((number) => typeof number === "number" && Number.isFinite(number))) return null;
  return {
    upcomingCount: value.upcomingCount as number,
    onlineCount: value.onlineCount as number,
    inPersonCount: value.inPersonCount as number,
    completedThisWeek: value.completedThisWeek as number,
    appointments: appointments as AppointmentRow[],
  };
}

function parseAdminDashboard(value: unknown): AdminDashboardData | null {
  if (!isRecord(value) || !Array.isArray(value.verifications) || !Array.isArray(value.appointments)) return null;
  const numbers = [value.pendingVerifications, value.scheduledToday, value.waiting, value.inProgress, value.completed];
  if (!numbers.every((number) => typeof number === "number" && Number.isFinite(number))) return null;
  const verifications = value.verifications.map((candidate): VerificationRow | null => {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.name !== "string" ||
      typeof candidate.initials !== "string" || typeof candidate.specialty !== "string" ||
      typeof candidate.submittedAt !== "string" || !DOCTOR_VERIFICATION_STATUSES.includes(candidate.status as (typeof DOCTOR_VERIFICATION_STATUSES)[number])) return null;
    return { id: candidate.id, name: candidate.name, initials: candidate.initials, specialty: candidate.specialty,
      submittedAt: candidate.submittedAt, status: candidate.status as VerificationRow["status"] };
  });
  const appointments = value.appointments.map((candidate): AdminDashboardData["appointments"][number] | null => {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.patientReference !== "string" ||
      typeof candidate.doctorName !== "string" || typeof candidate.date !== "string" || typeof candidate.startTime !== "string" ||
      !CONSULTATION_TYPES.includes(candidate.consultationType as (typeof CONSULTATION_TYPES)[number]) ||
      !APPOINTMENT_STATUSES.includes(candidate.status as (typeof APPOINTMENT_STATUSES)[number])) return null;
    return { id: candidate.id, patientReference: candidate.patientReference, doctorName: candidate.doctorName,
      date: candidate.date, startTime: candidate.startTime, consultationType: candidate.consultationType as "ONLINE" | "IN_PERSON",
      location: typeof candidate.location === "string" ? candidate.location : undefined,
      status: candidate.status as AppointmentRow["status"] };
  });
  if (verifications.some((row) => row === null) || appointments.some((row) => row === null)) return null;
  return {
    pendingVerifications: value.pendingVerifications as number,
    scheduledToday: value.scheduledToday as number,
    waiting: value.waiting as number,
    inProgress: value.inProgress as number,
    completed: value.completed as number,
    verifications: verifications as VerificationRow[],
    appointments: appointments as AdminDashboardData["appointments"],
  };
}

export function getDoctorDashboard(): Promise<DataResult<DoctorDashboardData>> {
  return apiGet("/v1/web/doctor/dashboard", parseDoctorDashboard);
}

export async function getDoctorDailyJoinGrant(appointmentId: string): Promise<{ grant: DailyJoinGrant | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { grant: null, error: "CARENOW_API_UNAVAILABLE" };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { grant: null, error: "AUTH_TOKEN_REQUIRED" };
    const cookieStore = await cookies();
    const response = await fetch(`${getApiOrigin()}/v1/web/doctor/appointments/${encodeURIComponent(appointmentId)}/video-token`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.access_token}`,
        accept: "application/json",
        "x-request-locale": cookieStore.get("carenow_locale")?.value ?? "en",
      },
      cache: "no-store",
    });
    const body = await response.json() as unknown;
    if (!response.ok || !isRecord(body) || typeof body.appointmentId !== "string" || typeof body.roomUrl !== "string" ||
      typeof body.token !== "string" || typeof body.userName !== "string" || body.role !== "DOCTOR" || typeof body.expiresAt !== "string") {
      return { grant: null, error: isRecord(body) && typeof body.code === "string" ? body.code : "DAILY_PROVIDER_UNAVAILABLE" };
    }
    const roomUrl = new URL(body.roomUrl);
    if (roomUrl.protocol !== "https:" || !roomUrl.hostname.endsWith(".daily.co")) return { grant: null, error: "DAILY_PROVIDER_UNAVAILABLE" };
    return { grant: {
      appointmentId: body.appointmentId, roomUrl: roomUrl.toString(), token: body.token,
      userName: body.userName, role: "DOCTOR", expiresAt: body.expiresAt,
    }, error: null };
  } catch {
    return { grant: null, error: "DAILY_PROVIDER_UNAVAILABLE" };
  }
}

export function getDoctorAppointments(status = "UPCOMING"): Promise<DataResult<AppointmentRow[]>> {
  return apiGet(`/v1/web/doctor/appointments?status=${encodeURIComponent(status)}`, (value) => {
    if (!isRecord(value) || !Array.isArray(value.items)) return null;
    const items = value.items.map(parseAppointment);
    return items.some((row) => row === null) ? null : items as AppointmentRow[];
  });
}

export function getDoctorPatients(): Promise<DataResult<DoctorPatientRow[]>> {
  return apiGet("/v1/web/doctor/patients", (value) => {
    if (!isRecord(value) || !Array.isArray(value.items)) return null;
    const items = value.items.map((row): DoctorPatientRow | null => {
      if (!isRecord(row) || typeof row.id !== "string" || typeof row.name !== "string" || typeof row.initials !== "string" ||
        typeof row.appointmentsCount !== "number" || !(typeof row.lastVisitAt === "string" || row.lastVisitAt === null) ||
        !(typeof row.nextAppointmentAt === "string" || row.nextAppointmentAt === null)) return null;
      return { id: row.id, name: row.name, initials: row.initials, appointmentsCount: row.appointmentsCount,
        lastVisitAt: row.lastVisitAt, nextAppointmentAt: row.nextAppointmentAt };
    });
    return items.some((row) => row === null) ? null : items as DoctorPatientRow[];
  });
}

export function getDoctorPatient(patientId: string): Promise<DataResult<DoctorPatientDetail>> {
  return apiGet(`/v1/web/doctor/patients/${encodeURIComponent(patientId)}`, (value) => {
    if (!isRecord(value) || !isRecord(value.patient) || !Array.isArray(value.appointments)) return null;
    const patient = value.patient;
    if (typeof patient.id !== "string" || typeof patient.name !== "string" || typeof patient.initials !== "string" ||
      !(typeof patient.phone === "string" || patient.phone === null)) return null;
    const appointments = value.appointments.map(parseAppointment);
    if (appointments.some((row) => row === null)) return null;
    return { patient: { id: patient.id, name: patient.name, phone: patient.phone, initials: patient.initials }, appointments: appointments as AppointmentRow[] };
  });
}

export function getAdminDashboard(): Promise<DataResult<AdminDashboardData>> {
  return apiGet("/v1/web/admin/dashboard", parseAdminDashboard);
}

function parseAdminAppointment(value: unknown): AdminAppointmentInfo | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.patientReference !== "string" ||
    typeof value.doctorId !== "string" || typeof value.doctorName !== "string" || typeof value.startsAt !== "string" ||
    typeof value.endsAt !== "string" || !CONSULTATION_TYPES.includes(value.consultationType as (typeof CONSULTATION_TYPES)[number]) ||
    !(typeof value.clinicName === "string" || value.clinicName === null) ||
    !(typeof value.clinicAddress === "string" || value.clinicAddress === null) ||
    !(typeof value.clinicCity === "string" || value.clinicCity === null) ||
    !APPOINTMENT_STATUSES.includes(value.status as (typeof APPOINTMENT_STATUSES)[number]) || typeof value.createdAt !== "string") return null;
  return {
    id: value.id, patientReference: value.patientReference, doctorId: value.doctorId, doctorName: value.doctorName,
    startsAt: value.startsAt, endsAt: value.endsAt, consultationType: value.consultationType as AdminAppointmentInfo["consultationType"],
    clinicName: value.clinicName, clinicAddress: value.clinicAddress, clinicCity: value.clinicCity,
    status: value.status as AdminAppointmentInfo["status"], createdAt: value.createdAt,
  };
}

export function getAdminAppointments(filters: { status?: string; type?: string; doctorId?: string; from?: string; to?: string } = {}): Promise<DataResult<AdminAppointmentsData>> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  const queryString = query.toString();
  return apiGet(`/v1/web/admin/appointments${queryString ? `?${queryString}` : ""}`, (value) => {
    if (!isRecord(value) || !Array.isArray(value.items) || !Array.isArray(value.doctors)) return null;
    const items = value.items.map(parseAdminAppointment);
    const doctors = value.doctors.map((doctor): { id: string; name: string } | null => {
      if (!isRecord(doctor) || typeof doctor.id !== "string" || typeof doctor.name !== "string") return null;
      return { id: doctor.id, name: doctor.name };
    });
    if (items.some((item) => item === null) || doctors.some((doctor) => doctor === null)) return null;
    return { items: items as AdminAppointmentInfo[], doctors: doctors as Array<{ id: string; name: string }> };
  });
}

export function getAdminAppointment(appointmentId: string): Promise<DataResult<AdminAppointmentInfo>> {
  return apiGet(`/v1/web/admin/appointments/${encodeURIComponent(appointmentId)}`, (value) => {
    if (!isRecord(value)) return null;
    return parseAdminAppointment(value.item);
  });
}

export function getDoctorAvailability(): Promise<DataResult<DoctorAvailabilityRule[]>> {
  return apiGet("/v1/web/doctor/availability", (value) => {
    if (!isRecord(value) || !Array.isArray(value.items)) return null;
    const items = value.items.map((candidate): DoctorAvailabilityRule | null => {
      if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.weekday !== "number" ||
        !Number.isInteger(candidate.weekday) || candidate.weekday < 0 || candidate.weekday > 6 ||
        typeof candidate.startTime !== "string" || typeof candidate.endTime !== "string" ||
        typeof candidate.slotMinutes !== "number" || ![15, 30, 45, 60].includes(candidate.slotMinutes)) return null;
      return { id: candidate.id, weekday: candidate.weekday, startTime: candidate.startTime,
        endTime: candidate.endTime, slotMinutes: candidate.slotMinutes };
    });
    return items.some((item) => item === null) ? null : items as DoctorAvailabilityRule[];
  });
}

export function getAdminSchedule(): Promise<DataResult<AdminScheduleData>> {
  return apiGet("/v1/web/admin/schedules", (value) => {
    if (!isRecord(value) || !Array.isArray(value.doctors) || !Array.isArray(value.clinics) || !Array.isArray(value.items)) return null;
    const doctors = value.doctors.map((candidate): AdminScheduleData["doctors"][number] | null => {
      if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.name !== "string" ||
        typeof candidate.specialty !== "string" || !Array.isArray(candidate.services) ||
        !candidate.services.every((item) => item === "ONLINE" || item === "IN_PERSON")) return null;
      return { id: candidate.id, name: candidate.name, specialty: candidate.specialty, services: candidate.services as Array<"ONLINE" | "IN_PERSON"> };
    });
    const clinics = value.clinics.map((candidate): AdminScheduleData["clinics"][number] | null => {
      if (!isRecord(candidate) || typeof candidate.doctorId !== "string" || typeof candidate.clinicId !== "string" || typeof candidate.name !== "string" || typeof candidate.isPrimary !== "boolean") return null;
      return { doctorId: candidate.doctorId, clinicId: candidate.clinicId, name: candidate.name, isPrimary: candidate.isPrimary };
    });
    const items = value.items.map((candidate): AdminScheduleSlot | null => {
      if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.doctorId !== "string" ||
        typeof candidate.doctorName !== "string" || !CONSULTATION_TYPES.includes(candidate.consultationType as (typeof CONSULTATION_TYPES)[number]) ||
        !(typeof candidate.clinicId === "string" || candidate.clinicId === null) || !(typeof candidate.clinicName === "string" || candidate.clinicName === null) ||
        typeof candidate.startsAt !== "string" || typeof candidate.endsAt !== "string" || !["OPEN", "BLOCKED", "BOOKED"].includes(String(candidate.status))) return null;
      return { id: candidate.id, doctorId: candidate.doctorId, doctorName: candidate.doctorName,
        consultationType: candidate.consultationType as "ONLINE" | "IN_PERSON", clinicId: candidate.clinicId,
        clinicName: candidate.clinicName, startsAt: candidate.startsAt, endsAt: candidate.endsAt,
        status: candidate.status as AdminScheduleSlot["status"] };
    });
    if (doctors.some((item) => item === null) || clinics.some((item) => item === null) || items.some((item) => item === null)) return null;
    return { doctors: doctors as AdminScheduleData["doctors"], clinics: clinics as AdminScheduleData["clinics"], items: items as AdminScheduleSlot[] };
  });
}

export function getAdminClinicAssignments(): Promise<DataResult<AdminClinicAssignmentData>> {
  return apiGet("/v1/web/admin/doctor-clinics", (value) => {
    if (!isRecord(value) || !Array.isArray(value.doctors) || !Array.isArray(value.clinics) || !Array.isArray(value.assignments)) return null;
    const doctors = value.doctors.map((row): AdminClinicAssignmentData["doctors"][number] | null => {
      if (!isRecord(row) || typeof row.id !== "string" || typeof row.name !== "string" || typeof row.specialty !== "string") return null;
      return { id: row.id, name: row.name, specialty: row.specialty };
    });
    const clinics = value.clinics.map((row): AdminClinicAssignmentData["clinics"][number] | null => {
      if (!isRecord(row) || typeof row.id !== "string" || typeof row.name !== "string" || typeof row.address !== "string" || typeof row.city !== "string" || typeof row.region !== "string") return null;
      return { id: row.id, name: row.name, address: row.address, city: row.city, region: row.region };
    });
    const assignments = value.assignments.map((row): AdminClinicAssignmentData["assignments"][number] | null => {
      if (!isRecord(row) || typeof row.doctorId !== "string" || typeof row.doctorName !== "string" || typeof row.specialty !== "string" ||
        typeof row.clinicId !== "string" || typeof row.clinicName !== "string" || typeof row.address !== "string" || typeof row.city !== "string" ||
        typeof row.region !== "string" || typeof row.isPrimary !== "boolean" || typeof row.assignedAt !== "string") return null;
      return { doctorId: row.doctorId, doctorName: row.doctorName, specialty: row.specialty, clinicId: row.clinicId,
        clinicName: row.clinicName, address: row.address, city: row.city, region: row.region, isPrimary: row.isPrimary, assignedAt: row.assignedAt };
    });
    if (doctors.some((row) => row === null) || clinics.some((row) => row === null) || assignments.some((row) => row === null)) return null;
    return { doctors: doctors as AdminClinicAssignmentData["doctors"], clinics: clinics as AdminClinicAssignmentData["clinics"], assignments: assignments as AdminClinicAssignmentData["assignments"] };
  });
}

export function getAdminClinics(): Promise<DataResult<AdminClinicsData>> {
  return apiGet("/v1/web/admin/clinics", (value) => {
    if (!isRecord(value) || !Array.isArray(value.items)) return null;
    const items = value.items.map((row): AdminClinicsData["items"][number] | null => {
      if (!isRecord(row) || typeof row.id !== "string" || typeof row.name !== "string" || typeof row.address !== "string" ||
        typeof row.city !== "string" || typeof row.region !== "string" || typeof row.countryCode !== "string" || typeof row.timeZone !== "string" ||
        typeof row.isActive !== "boolean" || typeof row.assignedDoctors !== "number" || typeof row.createdAt !== "string" || typeof row.updatedAt !== "string") return null;
      return { id: row.id, name: row.name, address: row.address, city: row.city, region: row.region, countryCode: row.countryCode,
        timeZone: row.timeZone, isActive: row.isActive, assignedDoctors: row.assignedDoctors, createdAt: row.createdAt, updatedAt: row.updatedAt };
    });
    return items.some((row) => row === null) ? null : { items: items as AdminClinicsData["items"] };
  });
}

function parseList(value: unknown): ListRow[] | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const items = value.items.map((candidate): ListRow | null => {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.label !== "string" ||
      typeof candidate.detail !== "string" || typeof candidate.status !== "string" || typeof candidate.updatedAt !== "string") return null;
    return { id: candidate.id, label: candidate.label, detail: candidate.detail, status: candidate.status,
      updatedAt: candidate.updatedAt, reference: typeof candidate.reference === "string" ? candidate.reference : undefined };
  });
  return items.some((item) => item === null) ? null : items as ListRow[];
}

export function getAuthorizedList(path: string): Promise<DataResult<ListRow[]>> {
  return apiGet(path, parseList);
}

export function getAuthorizedRecord(path: string): Promise<DataResult<ListRow>> {
  return apiGet(path, (value) => {
    if (!isRecord(value) || !isRecord(value.item)) return null;
    const row = parseList({ items: [value.item] });
    return row?.[0] ?? null;
  });
}

export async function getPublicSpecialties(): Promise<SpecialtyOption[]> {
  try {
    const response = await fetch(`${getApiOrigin()}/v1/public/specialties`, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return [];
    const result = await response.json() as unknown;
    if (!isRecord(result) || !Array.isArray(result.items)) return [];
    return result.items.filter((item): item is Record<string, unknown> => isRecord(item))
      .filter((item) => typeof item.id === "string" && typeof item.name === "string")
      .map((item) => ({ id: item.id as string, name: item.name as string, photoUrl: typeof item.photoUrl === "string" ? item.photoUrl : null }));
  } catch { return []; }
}

export function getAdminSpecialties(): Promise<DataResult<SpecialtyRow[]>> {
  return apiGet("/v1/web/admin/specialties", (value) => {
    if (!isRecord(value) || !Array.isArray(value.items)) return null;
    const items = value.items.map((row): SpecialtyRow | null => {
      if (!isRecord(row) || typeof row.id !== "string" || typeof row.name !== "string" || typeof row.isActive !== "boolean" ||
        typeof row.doctorCount !== "number" || !(typeof row.photoUrl === "string" || row.photoUrl === null) || typeof row.createdAt !== "string" || typeof row.updatedAt !== "string") return null;
      return { id: row.id, name: row.name, isActive: row.isActive, doctorCount: row.doctorCount, photoUrl: row.photoUrl, createdAt: row.createdAt, updatedAt: row.updatedAt };
    });
    return items.some((row) => row === null) ? null : items as SpecialtyRow[];
  });
}

export function getAdminDoctor(doctorId: string): Promise<DataResult<AdminDoctorProfile>> {
  return apiGet(`/v1/web/admin/doctors/${encodeURIComponent(doctorId)}`, (value) => {
    if (!isRecord(value) || !isRecord(value.item)) return null;
    const doctor = value.item;
    if (typeof doctor.id !== "string" || typeof doctor.displayName !== "string" || !(typeof doctor.email === "string" || doctor.email === null) ||
      !(typeof doctor.phone === "string" || doctor.phone === null) || typeof doctor.accountStatus !== "string" || typeof doctor.verificationStatus !== "string" ||
      typeof doctor.specialty !== "string" || typeof doctor.biography !== "string" || !(typeof doctor.profilePhotoUrl === "string" || doctor.profilePhotoUrl === null) || typeof doctor.licenseNumber !== "string" || typeof doctor.licenseRegion !== "string" || typeof doctor.licenseExpiry !== "string" ||
      typeof doctor.qualifications !== "string" || typeof doctor.experienceYears !== "number" || !Array.isArray(doctor.languages) || !doctor.languages.every((item) => typeof item === "string") ||
      !Array.isArray(doctor.services) || !doctor.services.every((item) => item === "ONLINE" || item === "IN_PERSON") || !Array.isArray(doctor.documents) ||
      typeof doctor.createdAt !== "string" || typeof doctor.updatedAt !== "string") return null;
    const documents = doctor.documents.map((item): AdminDoctorProfile["documents"][number] | null => {
      if (!isRecord(item) || typeof item.id !== "string" || typeof item.type !== "string" || typeof item.status !== "string" ||
        typeof item.uploadedAt !== "string" || typeof item.signedUrl !== "string") return null;
      return { id: item.id, type: item.type, status: item.status, uploadedAt: item.uploadedAt, signedUrl: item.signedUrl };
    });
    if (documents.some((item) => item === null)) return null;
    return {
      id: doctor.id, displayName: doctor.displayName, email: doctor.email, phone: doctor.phone,
      accountStatus: doctor.accountStatus, verificationStatus: doctor.verificationStatus, specialty: doctor.specialty, biography: doctor.biography, profilePhotoUrl: doctor.profilePhotoUrl,
      licenseNumber: doctor.licenseNumber, licenseRegion: doctor.licenseRegion, licenseExpiry: doctor.licenseExpiry,
      qualifications: doctor.qualifications, experienceYears: doctor.experienceYears, languages: doctor.languages,
      services: doctor.services, documents: documents as AdminDoctorProfile["documents"], createdAt: doctor.createdAt, updatedAt: doctor.updatedAt,
    };
  });
}

function parseNotifications(value: unknown): PortalNotification[] | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const items = value.items.map((candidate): PortalNotification | null => {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.title !== "string" ||
      typeof candidate.body !== "string" || typeof candidate.createdAt !== "string" ||
      !(typeof candidate.readAt === "string" || candidate.readAt === null) ||
      typeof candidate.targetType !== "string" || typeof candidate.targetId !== "string") return null;
    return { id: candidate.id, title: candidate.title, body: candidate.body, createdAt: candidate.createdAt,
      readAt: candidate.readAt, targetType: candidate.targetType, targetId: candidate.targetId };
  });
  return items.some((item) => item === null) ? null : items as PortalNotification[];
}

export function getNotifications(): Promise<DataResult<PortalNotification[]>> {
  return apiGet("/v1/notifications?limit=25", parseNotifications);
}

export function getUnreadCount(): Promise<DataResult<number>> {
  return apiGet("/v1/notifications/unread-count", (value) =>
    isRecord(value) && isRecord(value.data) && typeof value.data.count === "number" && Number.isSafeInteger(value.data.count) && value.data.count >= 0
      ? value.data.count : null);
}
