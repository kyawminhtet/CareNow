import { redirect } from "next/navigation";
import type { AccountStatus, ApplicationRole, AuthorizedSession, DoctorVerificationStatus } from "@carenow/contracts";
import { getApiOrigin } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSession(value: unknown): AuthorizedSession | null {
  if (!isRecord(value) || !isRecord(value.user)) return null;
  const user = value.user;
  const roles: ApplicationRole[] = ["DOCTOR", "ADMINISTRATOR"];
  const statuses: AccountStatus[] = ["INVITED", "ACTIVE", "SUSPENDED", "INACTIVE"];
  const verificationStatuses: DoctorVerificationStatus[] = ["PENDING", "VERIFIED", "REJECTED"];

  if (
    typeof user.id !== "string" ||
    typeof user.role !== "string" || !roles.includes(user.role as ApplicationRole) ||
    typeof user.accountStatus !== "string" || !statuses.includes(user.accountStatus as AccountStatus) ||
    typeof user.displayName !== "string"
  ) return null;

  const verificationStatus = typeof user.verificationStatus === "string" &&
    verificationStatuses.includes(user.verificationStatus as DoctorVerificationStatus)
    ? user.verificationStatus as DoctorVerificationStatus
    : undefined;

  return {
    userId: user.id,
    role: user.role as ApplicationRole,
    accountStatus: user.accountStatus as AccountStatus,
    verificationStatus,
    displayName: user.displayName,
  };
}

export type SessionResult =
  | { kind: "signed-out" }
  | { kind: "unavailable" }
  | { kind: "invalid" }
  | { kind: "ready"; session: AuthorizedSession };

export async function getAuthorizedSession(): Promise<SessionResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { kind: "unavailable" };

  try {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession) return { kind: "signed-out" };
    const response = await fetch(`${getApiOrigin()}/v1/auth/session`, {
      headers: { authorization: `Bearer ${authSession.access_token}`, accept: "application/json" },
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) return { kind: "invalid" };
    if (!response.ok) return { kind: "unavailable" };
    const authorizedSession = parseSession(await response.json() as unknown);
    return authorizedSession ? { kind: "ready", session: authorizedSession } : { kind: "invalid" };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function requireAccountRole(role: ApplicationRole): Promise<AuthorizedSession> {
  const result = await getAuthorizedSession();
  if (result.kind === "signed-out" || result.kind === "invalid") redirect("/sign-in");
  if (result.kind === "unavailable") throw new Error("CARENOW_API_UNAVAILABLE");
  if (result.session.role !== role) redirect(result.session.role === "DOCTOR" ? "/doctor/dashboard" : "/admin/dashboard");
  if (result.session.accountStatus !== "ACTIVE") redirect("/account/status");
  return result.session;
}

export async function requireRole(role: ApplicationRole): Promise<AuthorizedSession> {
  const session = await requireAccountRole(role);
  if (role === "DOCTOR" && session.verificationStatus !== "VERIFIED") redirect("/doctor/verification");
  return session;
}
