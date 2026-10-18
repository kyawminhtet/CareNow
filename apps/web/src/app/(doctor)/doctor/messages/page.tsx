import { requireRole } from "@/lib/auth/server";
import { DoctorChatInbox } from "@/components/doctor-chat";

export const dynamic = "force-dynamic";

export default async function DoctorMessagesPage() {
  await requireRole("DOCTOR");
  return <DoctorChatInbox />;
}
