import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { DoctorChatConversation } from "@/components/doctor-chat";

export const dynamic = "force-dynamic";

export default async function DoctorConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  await requireRole("DOCTOR");
  const { conversationId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)) notFound();
  return <DoctorChatConversation conversationId={conversationId} />;
}
