"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, LockKeyhole, MessageSquare, RefreshCw, Send, ShieldCheck } from "lucide-react";

type Conversation = {
  id: string;
  appointmentId: string;
  appointmentStatus: string;
  consultationType: "ONLINE" | "IN_PERSON";
  startsAt: string;
  endsAt: string;
  patientName: string;
  doctorName: string;
  specialty: string;
  clinicName: string | null;
  lastMessageAt: string | null;
  lastMessage: string | null;
  unreadCount: number;
  participantRole: "PATIENT" | "DOCTOR";
  availableAt: string;
  readOnlyAt: string;
  canSend: boolean;
  readOnly: boolean;
};

type ChatMessage = { id: string; senderName: string; content: string; createdAt: string; readAt: string | null; isMine: boolean };
type LocalMessage = ChatMessage & { delivery?: "sending" | "failed" };

function mergeMessages(current: LocalMessage[], incoming: Array<ChatMessage & { delivery?: "sending" | "failed" }>) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, { ...byId.get(message.id), ...message });
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

const timezone = "Asia/Yangon";
const formatDateTime = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
const formatTime = (value: string) => new Intl.DateTimeFormat("en", { timeStyle: "short", timeZone: timezone }).format(new Date(value));
const formatActivity = (value: string) => {
  const date = new Date(value);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return today === key ? formatTime(value) : formatDateTime(value);
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, cache: "no-store", headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  } catch {
    throw new Error("CareNow could not connect. Check your connection and try again.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof payload?.code === "string" ? payload.code : "REQUEST_FAILED";
    const errors: Record<string, string> = {
      CHAT_NOT_OPEN_YET: "Messaging opens 15 minutes before the appointment.",
      CHAT_READ_ONLY: "This conversation is read-only because its messaging period has ended.",
      CHAT_APPOINTMENT_CLOSED: "Messaging is unavailable for this cancelled appointment.",
      CHAT_MESSAGE_REQUIRED: "Enter a message before sending.",
      CHAT_MESSAGE_TOO_LONG: "Messages can be up to 4,000 characters.",
      CHAT_MESSAGE_SEND_FAILED: "Your message could not be sent. Check your connection and try again.",
      CHAT_CONVERSATION_NOT_FOUND: "This conversation is unavailable or is not assigned to your account.",
      CARENOW_API_UNAVAILABLE: "CareNow could not reach the API. Check your connection and try again.",
      DOCTOR_AUTH_REQUIRED: "Your session has expired. Sign in again to continue.",
    };
    throw new Error(errors[code] ?? code.replaceAll("_", " ").toLowerCase());
  }
  return payload as T;
}

function appointmentDetail(item: Conversation) {
  return `${item.consultationType === "ONLINE" ? "Online consultation" : `In-person visit${item.clinicName ? ` · ${item.clinicName}` : ""}`} · ${formatDateTime(item.startsAt)}`;
}

export function DoctorChatInbox() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const seenEvents = useRef(new Map<string, string>());
  const sync = useCallback(async () => {
    const result = await request<{ items: Conversation[] }>("/api/doctor/chat/conversations?limit=100");
    setItems(result.items);
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await sync();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load messages.");
    } finally { setLoading(false); }
  }, [sync]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void sync().catch(() => undefined);
    }, 15_000);
    const onVisible = () => { if (document.visibilityState === "visible") void sync().catch(() => undefined); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [sync]);
  const conversationIds = items.map((item) => item.id).sort().join(",");
  useEffect(() => {
    if (!conversationIds) return;
    let active = true;
    const stream = new EventSource("/api/doctor/chat/realtime");
    stream.addEventListener("message.created", (event) => {
        try {
          const envelope = JSON.parse((event as MessageEvent).data);
          const payload = envelope?.payload ?? envelope;
          const id = payload?.conversationId;
          if (!active || typeof id !== "string" || typeof payload?.id !== "string" || typeof payload?.createdAt !== "string" || typeof payload?.content !== "string" || seenEvents.current.get(id) === payload.id) return;
          seenEvents.current.set(id, payload.id);
          setItems((current) => current.map((item) => item.id !== id ? item : { ...item, lastMessage: payload.content, lastMessageAt: payload.createdAt, unreadCount: payload.senderRole === "PATIENT" ? item.unreadCount + 1 : item.unreadCount }).sort((a, b) => new Date(b.lastMessageAt ?? b.startsAt).getTime() - new Date(a.lastMessageAt ?? a.startsAt).getTime()));
        } catch { /* A manual refresh can recover malformed event data. */ }
    });
    stream.addEventListener("messages.read", (event) => {
        try {
          const envelope = JSON.parse((event as MessageEvent).data);
          const payload = envelope?.payload ?? envelope;
          if (payload?.readerRole === "DOCTOR" && typeof payload.conversationId === "string") setItems((current) => current.map((item) => item.id === payload.conversationId ? { ...item, unreadCount: 0 } : item));
        } catch { /* Ignore malformed read hints. */ }
    });
    stream.addEventListener("ready", () => { if (active) void sync().catch(() => undefined); });
    return () => { active = false; stream.close(); };
  }, [conversationIds, sync]);

  return <>
    <div className="page-heading"><div><h1>Messages</h1><p>Private appointment conversations with your patients.</p></div><button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "spin" : ""} />Refresh</button></div>
    <div className="chat-privacy notice-card"><ShieldCheck size={18} /><div><h3>Private patient conversations</h3><p>Each conversation is accessible only to the patient and the doctor assigned to that appointment.</p></div></div>
    {error ? <div className="card chat-state" role="alert"><strong>Messages could not be loaded</strong><p>{error}</p><button className="button secondary small" onClick={() => void load()}>Try again</button></div> : null}
    {loading && items.length === 0 ? <div className="card chat-state"><span className="chat-loading-indicator" aria-hidden="true" /><strong>Loading your conversations…</strong></div> : null}
    {!loading && !error && items.length === 0 ? <div className="card chat-state"><div className="empty-icon"><MessageSquare size={20} /></div><strong>No conversations yet</strong><p>Appointment conversations assigned to you will appear here.</p></div> : null}
    <div className="doctor-chat-list">{items.map((item) => <Link className={`card doctor-chat-row${item.unreadCount ? " unread" : ""}`} href={`/doctor/messages/${encodeURIComponent(item.id)}`} key={item.id}>
      <div className="chat-patient-avatar" aria-hidden="true">{item.patientName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>
      <div className="doctor-chat-main"><div className="doctor-chat-title"><strong>{item.patientName}</strong><span>{formatActivity(item.lastMessageAt ?? item.startsAt)}</span></div><div className="doctor-chat-context">{appointmentDetail(item)}</div><p>{item.lastMessage || (item.canSend ? "Start a conversation with your patient" : `Messaging opens ${formatDateTime(item.availableAt)}`)}</p></div>
      <div className="doctor-chat-trailing">{item.unreadCount > 0 ? <span className="chat-unread-badge" aria-label={`${item.unreadCount} unread messages`}>{item.unreadCount > 99 ? "99+" : item.unreadCount}</span> : <span className="chat-row-arrow">›</span>}</div>
    </Link>)}</div>
  </>;
}

export function DoctorChatConversation({ conversationId }: { conversationId: string }) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [realtimeState, setRealtimeState] = useState<"connecting" | "connected" | "error">("connecting");
  const [now, setNow] = useState(Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastServerMessageId = useRef<string | null>(null);
  const lastServerMessageAt = useRef<string | null>(null);
  const catchingUp = useRef(false);

  const refreshMessages = useCallback(async () => {
    const response = await request<{ items: ChatMessage[]; nextCursor: string | null }>(`/api/doctor/chat/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`);
    const latest = response.items[response.items.length - 1];
    if (latest && (!lastServerMessageAt.current || latest.createdAt > lastServerMessageAt.current)) {
      lastServerMessageId.current = latest.id;
      lastServerMessageAt.current = latest.createdAt;
    }
    setMessages((current) => mergeMessages(current, response.items));
    setNextCursor(response.nextCursor);
    const unread = response.items.some((message) => !message.isMine && !message.readAt);
    if (unread) {
      try {
        const read = await request<{ markedRead: number; readAt: string }>(`/api/doctor/chat/conversations/${encodeURIComponent(conversationId)}/read`, { method: "POST" });
        if (read.markedRead > 0) setMessages((current) => current.map((message) => !message.isMine && !message.readAt ? { ...message, readAt: read.readAt } : message));
      } catch { /* History remains visible while read-state sync is offline. */ }
    }
  }, [conversationId]);

  const catchUp = useCallback(async () => {
    if (catchingUp.current) return;
    catchingUp.current = true;
    try {
      let cursor: string = lastServerMessageId.current ?? "";
      if (!cursor) { await refreshMessages(); setSyncError(""); return; }
      while (true) {
        const result = await request<{ items: ChatMessage[]; nextCursor: string | null }>(`/api/doctor/chat/conversations/${encodeURIComponent(conversationId)}/messages?limit=100&after=${encodeURIComponent(cursor)}`);
        if (result.items.length) {
          setMessages((current) => mergeMessages(current, result.items));
          const latest = result.items[result.items.length - 1];
          cursor = latest.id;
          lastServerMessageId.current = latest.id;
          lastServerMessageAt.current = latest.createdAt;
          setConversation((current) => current ? { ...current, lastMessage: latest.content, lastMessageAt: latest.createdAt } : current);
          try {
            const read = await request<{ markedRead: number; readAt: string }>(`/api/doctor/chat/conversations/${encodeURIComponent(conversationId)}/read`, { method: "POST" });
            if (read.markedRead > 0) setMessages((current) => current.map((message) => !message.isMine && !message.readAt ? { ...message, readAt: read.readAt } : message));
          } catch { /* Catch up can succeed while read-state syncing is offline. */ }
        }
        if (!result.nextCursor || !result.items.length) break;
      }
      setSyncError("");
    } catch { setSyncError("Recent messages could not sync. CareNow will retry when the connection returns."); }
    finally { catchingUp.current = false; }
  }, [conversationId, refreshMessages]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await request<{ items: Conversation[] }>("/api/doctor/chat/conversations?limit=100");
      const found = response.items.find((item) => item.id === conversationId);
      if (!found) throw new Error("This conversation is unavailable or is not assigned to your account.");
      setConversation(found);
      await refreshMessages();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load conversation.");
    } finally { setLoading(false); }
  }, [conversationId, refreshMessages]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!conversation) return;
    const events = new EventSource(`/api/doctor/chat/realtime/${encodeURIComponent(conversation.id)}`);
    events.onopen = () => setRealtimeState("connecting");
    events.addEventListener("ready", () => { setRealtimeState("connected"); void catchUp(); });
    events.addEventListener("message.created", (event) => {
      try {
        const envelope = JSON.parse((event as MessageEvent).data);
        const payload = envelope?.payload ?? envelope;
        if (typeof payload?.id !== "string" || typeof payload?.content !== "string" || typeof payload?.createdAt !== "string") { void catchUp(); return; }
        const message: ChatMessage = { id: payload.id, senderName: typeof payload.senderName === "string" ? payload.senderName : "CareNow participant", content: payload.content, createdAt: payload.createdAt, readAt: null, isMine: payload.senderRole === "DOCTOR" };
        setMessages((current) => mergeMessages(current, [message]));
        setConversation((current) => current ? { ...current, lastMessage: message.content, lastMessageAt: message.createdAt, unreadCount: 0 } : current);
        if (!message.isMine) void request<{ readAt: string }>(`/api/doctor/chat/conversations/${encodeURIComponent(conversationId)}/read`, { method: "POST" }).then(({ readAt }) => setMessages((current) => current.map((item) => item.id === message.id ? { ...item, readAt } : item))).catch(() => undefined);
        void catchUp();
      } catch { void catchUp(); }
    });
    events.addEventListener("messages.read", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        if (payload?.readerRole === "PATIENT" && typeof payload.readAt === "string") {
          setMessages((current) => current.map((message) => message.isMine && !message.readAt ? { ...message, readAt: payload.readAt } : message));
        }
      } catch { /* Ignore malformed realtime hints; the API remains authoritative. */ }
    });
    events.addEventListener("realtime.error", () => setRealtimeState("error"));
    events.onerror = () => setRealtimeState("error");
    const syncTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void catchUp();
    }, 5_000);
    const onVisible = () => { if (document.visibilityState === "visible") void catchUp(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(syncTimer); document.removeEventListener("visibilitychange", onVisible); events.close(); };
  }, [conversation?.id, catchUp, conversationId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages.length]);

  const opensAt = conversation ? new Date(conversation.availableAt).getTime() : 0;
  const readOnlyAt = conversation ? new Date(conversation.readOnlyAt).getTime() : 0;
  const closedByAppointment = conversation?.appointmentStatus === "CANCELLED" || conversation?.appointmentStatus === "NO_SHOW";
  const canSend = Boolean(conversation && !closedByAppointment && now >= opensAt && now <= readOnlyAt);
  const readOnly = Boolean(conversation && (closedByAppointment || now > readOnlyAt));

  const loadOlder = async () => {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    setSyncError("");
    try {
      const result = await request<{ items: ChatMessage[]; nextCursor: string | null }>(`/api/doctor/chat/conversations/${encodeURIComponent(conversationId)}/messages?limit=50&before=${encodeURIComponent(nextCursor)}`);
      setMessages((current) => {
        const existing = new Set(current.map((message) => message.id));
        return [...result.items.filter((message) => !existing.has(message.id)), ...current];
      });
      setNextCursor(result.nextCursor);
    } catch (cause) { setSyncError(cause instanceof Error ? cause.message : "Could not load older messages."); }
    finally { setLoadingOlder(false); }
  };

  const sendContent = async (content: string, optimisticId = `local:${crypto.randomUUID()}`, clientMessageId = optimisticId.replace(/^local:/, "")) => {
    if (!content || sending || !canSend) return;
    setSending(true);
    setError("");
    setMessages((current) => current.map((message) => message.id === optimisticId ? { ...message, delivery: "sending" } : message));
    try {
      const response = await request<{ item: ChatMessage }>(`/api/doctor/chat/conversations/${encodeURIComponent(conversationId)}/messages`, { method: "POST", body: JSON.stringify({ content, clientMessageId }) });
      setMessages((current) => mergeMessages(current.filter((message) => message.id !== optimisticId), [response.item]));
      setConversation((current) => current ? { ...current, lastMessage: content, lastMessageAt: response.item.createdAt, unreadCount: 0 } : current);
      void catchUp();
    } catch (cause) {
      setMessages((current) => current.map((message) => message.id === optimisticId ? { ...message, delivery: "failed" } : message));
      setError(cause instanceof Error ? cause.message : "Your message could not be sent.");
    }
    finally { setSending(false); }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending || !canSend) return;
    const clientMessageId = crypto.randomUUID();
    const optimisticId = `local:${clientMessageId}`;
    setDraft("");
    setMessages((current) => mergeMessages(current, [{ id: optimisticId, senderName: "You", content, createdAt: new Date().toISOString(), readAt: null, isMine: true, delivery: "sending" }]));
    await sendContent(content, optimisticId, clientMessageId);
  };

  const appointmentContext = useMemo(() => conversation ? appointmentDetail(conversation) : "Appointment chat", [conversation]);

  return <>
    <div className="page-heading"><div><Link className="back-link" href="/doctor/messages"><ArrowLeft size={14} />Back to messages</Link><h1 className="chat-page-title">{conversation?.patientName ?? "Conversation"}</h1><p>{appointmentContext}</p></div><span className={`chat-connection ${realtimeState}`}><span />{realtimeState === "connected" ? "Live updates on" : realtimeState === "error" ? "Live updates unavailable" : "Connecting…"}</span></div>
    <section className="card doctor-chat-workspace" aria-label="Appointment conversation">
      <header className="chat-workspace-context"><div><div className="chat-context-title"><LockKeyhole size={15} />Private conversation</div><p>Only you and the patient assigned to this appointment can access these messages.</p></div><div className="chat-context-appointment"><strong>{conversation?.consultationType === "ONLINE" ? "Online consultation" : "In-person visit"}</strong><span>{conversation ? `${formatDateTime(conversation.startsAt)} – ${formatTime(conversation.endsAt)}` : "Loading appointment…"}</span>{conversation?.clinicName ? <span>{conversation.clinicName}</span> : null}</div></header>
      {conversation && !canSend && !readOnly ? <div className="chat-window-notice"><LockKeyhole size={15} /><div><strong>Messaging opens 15 minutes before the appointment</strong><span>Sending becomes available {formatDateTime(conversation.availableAt)}.</span></div></div> : null}
      {readOnly ? <div className="chat-window-notice read-only"><LockKeyhole size={15} /><div><strong>This conversation is read-only</strong><span>{closedByAppointment ? "The appointment was cancelled or marked as a no-show." : `The messaging period ended ${formatDateTime(conversation!.readOnlyAt)}.`}</span></div></div> : null}
      {realtimeState === "error" ? <div className="chat-live-warning" role="status">Live connection is reconnecting. CareNow checks for new messages automatically.</div> : null}
      <div className="chat-message-list" aria-live="polite">
        {loading && !conversation ? <div className="chat-state"><span className="chat-loading-indicator" aria-hidden="true" /><strong>Loading conversation…</strong></div> : null}
        {error ? <div className="chat-inline-error" role="alert"><strong>Conversation could not be loaded</strong><span>{error}</span><button className="button secondary small" onClick={() => void load()}>Try again</button></div> : null}
        {nextCursor ? <button className="chat-load-older" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? "Loading older messages…" : "Load older messages"}</button> : null}
        {!loading && !error && messages.length === 0 ? <div className="chat-empty-history"><div className="empty-icon"><MessageSquare size={19} /></div><strong>No messages yet</strong><p>{canSend ? "Send a message to start your conversation." : "Messages will appear here when you and the patient begin chatting."}</p></div> : null}
        {messages.map((message) => <article className={`chat-message${message.isMine ? " mine" : ""}`} key={message.id}><div className="chat-bubble">{!message.isMine ? <strong>{message.senderName}</strong> : null}<p>{message.content}</p></div><span>{formatTime(message.createdAt)}{message.isMine ? ` · ${message.delivery === "sending" ? "Sending…" : message.delivery === "failed" ? "Not sent" : message.readAt ? "Read" : "Sent"}` : ""}{message.delivery === "failed" ? <> · <button type="button" className="chat-retry-button" onClick={() => void sendContent(message.content, message.id)}>Retry</button></> : null}</span></article>)}
        {syncError ? <div className="chat-inline-error" role="alert">{syncError}</div> : null}
        <div ref={bottomRef} />
      </div>
      <form className="chat-composer" onSubmit={send}><label className="sr-only" htmlFor="doctor-chat-composer">Message the patient</label><textarea id="doctor-chat-composer" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={2} placeholder={readOnly ? "This conversation is read-only" : canSend ? "Write a message…" : "Messaging opens 15 minutes before the appointment"} disabled={!canSend || sending} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button type="submit" className="button" disabled={!canSend || !draft.trim() || sending}>{sending ? <span className="spin">◌</span> : <Send size={14} />}{sending ? "Sending…" : "Send"}</button><small>Text only · Up to 4,000 characters</small></form>
    </section>
  </>;
}
