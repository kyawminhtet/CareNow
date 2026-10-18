import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ChatRealtimeService } from "./chat-realtime.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHAT_EARLY_OPEN_MS = 15 * 60 * 1000;
const CHAT_AFTER_END_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 4000;

type ConversationRow = {
  id: string;
  appointmentId: string;
  appointmentStatus: string;
  consultationType: string;
  startsAt: Date;
  endsAt: Date;
  patientId: string;
  doctorId: string;
  patientName: string;
  doctorName: string;
  doctorPhotoKey?: string | null;
  specialty: string;
  clinicName: string | null;
  lastMessageAt: Date | null;
  lastMessage: string | null;
  unreadCount: number;
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly prisma: PrismaService, private readonly realtime: ChatRealtimeService) {}

  async listConversations(userId: string, limitValue?: string) {
    const limit = this.parseLimit(limitValue);
    const rows = await this.prisma.$queryRaw<ConversationRow[]>(Prisma.sql`
      SELECT cc.id::text AS id, a.id::text AS "appointmentId", a.status::text AS "appointmentStatus",
        a.consultation_type::text AS "consultationType", s.starts_at AS "startsAt", s.ends_at AS "endsAt",
        a.patient_user_id::text AS "patientId", a.doctor_user_id::text AS "doctorId",
        patient.display_name AS "patientName", doctor.display_name AS "doctorName", dp.specialty,
        dp.profile_photo_key AS "doctorPhotoKey",
        clinic.name AS "clinicName", cc.last_message_at AS "lastMessageAt",
        (SELECT cm.content FROM public.chat_messages cm WHERE cm.conversation_id = cc.id ORDER BY cm.created_at DESC, cm.id DESC LIMIT 1) AS "lastMessage",
        (SELECT count(*)::int FROM public.chat_messages cm WHERE cm.conversation_id = cc.id
          AND cm.sender_user_id <> ${userId}::uuid AND cm.read_at IS NULL) AS "unreadCount"
      FROM public.chat_conversations cc
      JOIN public.appointments a ON a.id = cc.appointment_id
      JOIN public.appointment_slots s ON s.id = a.slot_id
      JOIN public.app_users patient ON patient.id = a.patient_user_id
      JOIN public.app_users doctor ON doctor.id = a.doctor_user_id
      JOIN public.doctor_profiles dp ON dp.app_user_id = doctor.id
      LEFT JOIN public.clinics clinic ON clinic.id = a.clinic_id
      WHERE a.patient_user_id = ${userId}::uuid OR a.doctor_user_id = ${userId}::uuid
      ORDER BY COALESCE(cc.last_message_at, cc.created_at) DESC, cc.id DESC
      LIMIT ${limit}`);
    const now = Date.now();
    return { items: rows.map((row) => this.conversationItem(row, userId, now)) };
  }

  async messages(userId: string, conversationId: string, limitValue?: string, beforeId?: string, afterId?: string) {
    await this.requireConversation(userId, conversationId);
    const limit = this.parseLimit(limitValue);
    if ((beforeId && !UUID.test(beforeId)) || (afterId && !UUID.test(afterId)) || (beforeId && afterId)) {
      throw new BadRequestException({ code: "INVALID_CHAT_CURSOR" });
    }
    const rows = await this.prisma.$queryRaw<Array<{ id: string; senderUserId: string; senderName: string; content: string; createdAt: Date; readAt: Date | null }>>(Prisma.sql`
      SELECT message.id::text AS id, message.sender_user_id::text AS "senderUserId",
        sender.display_name AS "senderName", message.content, message.created_at AS "createdAt", message.read_at AS "readAt"
      FROM public.chat_messages message
      JOIN public.app_users sender ON sender.id = message.sender_user_id
      WHERE message.conversation_id = ${conversationId}::uuid
        AND (${beforeId ?? null}::uuid IS NULL OR (message.created_at, message.id) < (
          SELECT cursor.created_at, cursor.id FROM public.chat_messages cursor
          WHERE cursor.id = ${beforeId ?? null}::uuid AND cursor.conversation_id = ${conversationId}::uuid
        ))
        AND (${afterId ?? null}::uuid IS NULL OR (message.created_at, message.id) > (
          SELECT cursor.created_at, cursor.id FROM public.chat_messages cursor
          WHERE cursor.id = ${afterId ?? null}::uuid AND cursor.conversation_id = ${conversationId}::uuid
        ))
      ORDER BY message.created_at ${afterId ? Prisma.raw("ASC") : Prisma.raw("DESC")}, message.id ${afterId ? Prisma.raw("ASC") : Prisma.raw("DESC")} LIMIT ${limit}`);
    const nextCursor = rows.length === limit ? rows[rows.length - 1]?.id ?? null : null;
    const ordered = afterId ? rows : rows.reverse();
    const items = ordered.map(({ senderUserId, ...message }) => ({ ...message, isMine: senderUserId === userId }));
    return { items, nextCursor };
  }

  async sendMessage(userId: string, conversationId: string, body: unknown) {
    const requestBody = body as Record<string, unknown> | null;
    const content = requestBody?.content;
    const clientMessageId = requestBody?.clientMessageId;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new BadRequestException({ code: "CHAT_MESSAGE_REQUIRED" });
    }
    const normalizedContent = content.trim();
    if (clientMessageId !== undefined && (typeof clientMessageId !== "string" || !UUID.test(clientMessageId))) {
      throw new BadRequestException({ code: "INVALID_CLIENT_MESSAGE_ID" });
    }
    if (Array.from(normalizedContent).length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException({ code: "CHAT_MESSAGE_TOO_LONG", maxLength: MAX_MESSAGE_LENGTH });
    }

    let created: { id: string; senderName: string; senderRole: "PATIENT" | "DOCTOR"; createdAt: Date; isNew: boolean };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<ConversationRow & { senderName: string }>>(Prisma.sql`
          SELECT cc.id::text AS id, a.id::text AS "appointmentId", a.status::text AS "appointmentStatus",
            a.consultation_type::text AS "consultationType", s.starts_at AS "startsAt", s.ends_at AS "endsAt",
            a.patient_user_id::text AS "patientId", a.doctor_user_id::text AS "doctorId",
            patient.display_name AS "patientName", doctor.display_name AS "doctorName", dp.specialty,
            clinic.name AS "clinicName", cc.last_message_at AS "lastMessageAt", NULL::text AS "lastMessage", 0::int AS "unreadCount",
            actor.display_name AS "senderName"
          FROM public.chat_conversations cc
          JOIN public.appointments a ON a.id = cc.appointment_id
          JOIN public.appointment_slots s ON s.id = a.slot_id
          JOIN public.app_users patient ON patient.id = a.patient_user_id
          JOIN public.app_users doctor ON doctor.id = a.doctor_user_id
          JOIN public.doctor_profiles dp ON dp.app_user_id = doctor.id
          LEFT JOIN public.clinics clinic ON clinic.id = a.clinic_id
          JOIN public.app_users actor ON actor.id = ${userId}::uuid
          WHERE cc.id = ${conversationId}::uuid
            AND (a.patient_user_id = ${userId}::uuid OR a.doctor_user_id = ${userId}::uuid)
          FOR UPDATE OF cc, a`);
        const conversation = rows[0];
        if (!conversation) throw new NotFoundException({ code: "CHAT_CONVERSATION_NOT_FOUND" });
        if (clientMessageId) {
          const previous = await tx.$queryRaw<Array<{ id: string; content: string; createdAt: Date }>>(Prisma.sql`
            SELECT id::text AS id, content, created_at AS "createdAt" FROM public.chat_messages
            WHERE conversation_id = ${conversationId}::uuid AND sender_user_id = ${userId}::uuid AND client_message_id = ${clientMessageId}::uuid`);
          if (previous[0]) {
            if (previous[0].content !== normalizedContent) throw new ConflictException({ code: "CHAT_IDEMPOTENCY_KEY_REUSED" });
            return { id: previous[0].id, senderName: conversation.senderName, senderRole: conversation.patientId === userId ? "PATIENT" as const : "DOCTOR" as const, createdAt: previous[0].createdAt, isNew: false };
          }
        }
        const now = new Date();
        this.assertCanSend(conversation, now);
        let messageRows = await tx.$queryRaw<Array<{ id: string; content: string; createdAt: Date }>>(Prisma.sql`
          INSERT INTO public.chat_messages(conversation_id, sender_user_id, content, client_message_id)
          VALUES (${conversationId}::uuid, ${userId}::uuid, ${normalizedContent}, ${clientMessageId ?? null}::uuid)
          ON CONFLICT (conversation_id, sender_user_id, client_message_id) DO NOTHING
          RETURNING id::text AS id, content, created_at AS "createdAt"`);
        if (!messageRows[0] && clientMessageId) {
          messageRows = await tx.$queryRaw<Array<{ id: string; content: string; createdAt: Date }>>(Prisma.sql`
            SELECT id::text AS id, content, created_at AS "createdAt" FROM public.chat_messages
            WHERE conversation_id = ${conversationId}::uuid AND sender_user_id = ${userId}::uuid AND client_message_id = ${clientMessageId}::uuid`);
          if (messageRows[0]?.content !== normalizedContent) throw new ConflictException({ code: "CHAT_IDEMPOTENCY_KEY_REUSED" });
        }
        await tx.$executeRaw(Prisma.sql`
          UPDATE public.chat_conversations SET last_message_at = GREATEST(COALESCE(last_message_at, ${messageRows[0].createdAt}), ${messageRows[0].createdAt}), updated_at = now()
          WHERE id = ${conversationId}::uuid`);
          return { id: messageRows[0].id, senderName: conversation.senderName, senderRole: conversation.patientId === userId ? "PATIENT" as const : "DOCTOR" as const, createdAt: messageRows[0].createdAt, isNew: true };
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException || error instanceof BadRequestException) throw error;
      this.logger.error(`Could not persist message in conversation ${conversationId}.`, error instanceof Error ? error.stack : undefined);
      throw new ServiceUnavailableException({ code: "CHAT_MESSAGE_SEND_FAILED" });
    }

    if (created.isNew) {
      await this.realtime.broadcast(conversationId, "message.created", {
        id: created.id,
        conversationId,
        senderRole: created.senderRole,
        senderName: created.senderName,
        content: normalizedContent,
        createdAt: created.createdAt.toISOString(),
      });
    }
    return { item: { ...created, content: normalizedContent, isMine: true, conversationId } };
  }

  async markRead(userId: string, conversationId: string) {
    const conversation = await this.requireConversation(userId, conversationId);
    const readAt = new Date();
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      WITH updated AS (
        UPDATE public.chat_messages
        SET read_at = ${readAt}
        WHERE conversation_id = ${conversationId}::uuid AND sender_user_id <> ${userId}::uuid AND read_at IS NULL
        RETURNING id
      ) SELECT count(*)::int AS count FROM updated`);
    if (rows[0]?.count) {
      await this.realtime.broadcast(conversationId, "messages.read", {
        conversationId,
        readerUserId: userId,
        readerRole: conversation.patientId === userId ? "PATIENT" : "DOCTOR",
        readAt: readAt.toISOString(),
      });
    }
    return { markedRead: rows[0]?.count ?? 0, readAt: readAt.toISOString() };
  }

  async unreadCount(userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT count(*)::int AS count
      FROM public.chat_messages message
      JOIN public.chat_conversations cc ON cc.id = message.conversation_id
      JOIN public.appointments a ON a.id = cc.appointment_id
      WHERE message.sender_user_id <> ${userId}::uuid AND message.read_at IS NULL
        AND (a.patient_user_id = ${userId}::uuid OR a.doctor_user_id = ${userId}::uuid)`);
    return { count: rows[0]?.count ?? 0 };
  }

  private async requireConversation(userId: string, conversationId: string) {
    if (!UUID.test(conversationId)) throw new BadRequestException({ code: "INVALID_CHAT_CONVERSATION_ID" });
    const rows = await this.prisma.$queryRaw<ConversationRow[]>(Prisma.sql`
      SELECT cc.id::text AS id, a.id::text AS "appointmentId", a.status::text AS "appointmentStatus",
        a.consultation_type::text AS "consultationType", s.starts_at AS "startsAt", s.ends_at AS "endsAt",
        a.patient_user_id::text AS "patientId", a.doctor_user_id::text AS "doctorId",
        patient.display_name AS "patientName", doctor.display_name AS "doctorName", dp.specialty,
        clinic.name AS "clinicName", cc.last_message_at AS "lastMessageAt", NULL::text AS "lastMessage", 0::int AS "unreadCount"
      FROM public.chat_conversations cc
      JOIN public.appointments a ON a.id = cc.appointment_id
      JOIN public.appointment_slots s ON s.id = a.slot_id
      JOIN public.app_users patient ON patient.id = a.patient_user_id
      JOIN public.app_users doctor ON doctor.id = a.doctor_user_id
      JOIN public.doctor_profiles dp ON dp.app_user_id = doctor.id
      LEFT JOIN public.clinics clinic ON clinic.id = a.clinic_id
      WHERE cc.id = ${conversationId}::uuid AND (a.patient_user_id = ${userId}::uuid OR a.doctor_user_id = ${userId}::uuid)`);
    if (!rows[0]) throw new NotFoundException({ code: "CHAT_CONVERSATION_NOT_FOUND" });
    return rows[0];
  }

  private assertCanSend(conversation: ConversationRow, now: Date) {
    if (conversation.appointmentStatus === "CANCELLED" || conversation.appointmentStatus === "NO_SHOW") {
      throw new ConflictException({ code: "CHAT_APPOINTMENT_CLOSED" });
    }
    const availableAt = new Date(conversation.startsAt.getTime() - CHAT_EARLY_OPEN_MS);
    const readOnlyAt = new Date(conversation.endsAt.getTime() + CHAT_AFTER_END_MS);
    if (now < availableAt) {
      throw new ConflictException({ code: "CHAT_NOT_OPEN_YET", availableAt: availableAt.toISOString() });
    }
    if (now > readOnlyAt) {
      throw new ConflictException({ code: "CHAT_READ_ONLY", readOnlyAt: readOnlyAt.toISOString() });
    }
  }

  private conversationItem(row: ConversationRow, userId: string, now: number) {
    const availableAt = new Date(row.startsAt.getTime() - CHAT_EARLY_OPEN_MS);
    const readOnlyAt = new Date(row.endsAt.getTime() + CHAT_AFTER_END_MS);
    const closedByAppointment = row.appointmentStatus === "CANCELLED" || row.appointmentStatus === "NO_SHOW";
    return {
      id: row.id,
      appointmentId: row.appointmentId,
      appointmentStatus: row.appointmentStatus,
      consultationType: row.consultationType,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      patientName: row.patientName,
      doctorName: row.doctorName,
      doctorPhotoUrl: this.profilePhotoUrl(row.doctorPhotoKey ?? null),
      specialty: row.specialty,
      clinicName: row.clinicName,
      lastMessageAt: row.lastMessageAt,
      lastMessage: row.lastMessage,
      unreadCount: row.unreadCount,
      participantRole: row.patientId === userId ? "PATIENT" : "DOCTOR",
      availableAt: availableAt.toISOString(),
      readOnlyAt: readOnlyAt.toISOString(),
      canSend: !closedByAppointment && now >= availableAt.getTime() && now <= readOnlyAt.getTime(),
      readOnly: closedByAppointment || now > readOnlyAt.getTime(),
    };
  }

  private parseLimit(value?: string) {
    if (value === undefined) return 50;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw new BadRequestException({ code: "INVALID_CHAT_PAGE_SIZE" });
    return parsed;
  }

  private profilePhotoUrl(key: string | null) {
    const base = process.env.SUPABASE_URL;
    return key && base
      ? `${base.replace(/\/$/, "")}/storage/v1/object/public/doctor-profile-photos/${key.split("/").map(encodeURIComponent).join("/")}`
      : null;
  }
}
