import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api, dateTime, doctorDisplayName, type ChatConversation, type ChatMessage } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { colors, styles } from "../../lib/theme";
import { Card, Copy, ErrorText } from "../../components/ui";

function initials(name: string) {
  return name.replace(/^(?:dr\.?\s*)+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function messageTime(value: string) {
  return new Intl.DateTimeFormat("en", { timeStyle: "short", timeZone: "Asia/Yangon" }).format(new Date(value));
}

function newMessageUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

type LocalMessage = ChatMessage & { delivery?: "sending" | "failed" };

function mergeMessages(current: LocalMessage[], incoming: Array<ChatMessage & { delivery?: "sending" | "failed" }>) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, { ...byId.get(message.id), ...message });
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export default function ChatConversationScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [realtimeError, setRealtimeError] = useState(false);
  const [now, setNow] = useState(Date.now());
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffset = useRef(0);
  const contentHeight = useRef(0);
  const viewportHeight = useRef(0);
  const stickToBottom = useRef(true);
  const preserveScroll = useRef<{ offset: number; height: number } | null>(null);
  const lastServerMessageId = useRef<string | null>(null);
  const lastServerMessageAt = useRef<string | null>(null);
  const activeConversationId = useRef(id);
  const catchingUp = useRef(false);

  useEffect(() => { activeConversationId.current = id; lastServerMessageId.current = null; lastServerMessageAt.current = null; }, [id]);

  const refreshMessages = useCallback(async () => {
    if (!id) return;
    const result = await api<{ items: ChatMessage[]; nextCursor: string | null }>(`/chat/conversations/${encodeURIComponent(id)}/messages?limit=50`);
    const latest = result.items[result.items.length - 1];
    if (latest && (!lastServerMessageAt.current || latest.createdAt > lastServerMessageAt.current)) {
      lastServerMessageId.current = latest.id;
      lastServerMessageAt.current = latest.createdAt;
    }
    setMessages((current) => mergeMessages(current, result.items));
    setNextCursor(result.nextCursor);
    const latestMessage = result.items[result.items.length - 1];
    if (latestMessage) setConversation((current) => current ? { ...current, lastMessage: latestMessage.content, lastMessageAt: latestMessage.createdAt, unreadCount: 0 } : current);
    try {
      const read = await api<{ markedRead: number; readAt: string }>(`/chat/conversations/${encodeURIComponent(id)}/read`, { method: "POST" });
      if (read.markedRead > 0) {
        setMessages((current) => current.map((message) => !message.isMine && !message.readAt ? { ...message, readAt: read.readAt } : message));
      }
    } catch {
      // Message history remains available if read-state sync is temporarily offline.
    }
  }, [id]);

  const catchUp = useCallback(async () => {
    if (!id || activeConversationId.current !== id || catchingUp.current) return;
    catchingUp.current = true;
    try {
      let cursor: string = lastServerMessageId.current ?? "";
      if (!cursor) {
        await refreshMessages();
        setSyncError("");
        return;
      }
      while (true) {
        const result = await api<{ items: ChatMessage[]; nextCursor: string | null }>(`/chat/conversations/${encodeURIComponent(id)}/messages?limit=100&after=${encodeURIComponent(cursor)}`);
        if (activeConversationId.current !== id) return;
        if (result.items.length) {
          setMessages((current) => mergeMessages(current, result.items));
          const latest = result.items[result.items.length - 1];
          cursor = latest.id;
          lastServerMessageId.current = latest.id;
          lastServerMessageAt.current = latest.createdAt;
          setConversation((current) => current ? { ...current, lastMessage: latest.content, lastMessageAt: latest.createdAt } : current);
          try {
            const read = await api<{ markedRead: number; readAt: string }>(`/chat/conversations/${encodeURIComponent(id)}/read`, { method: "POST" });
            if (read.markedRead > 0) setMessages((current) => current.map((message) => !message.isMine && !message.readAt ? { ...message, readAt: read.readAt } : message));
          } catch { /* Messages remain visible while read state reconnects. */ }
        }
        if (!result.nextCursor || !result.items.length) break;
      }
      setSyncError("");
    } catch {
      setSyncError("Could not sync recent messages. CareNow will try again automatically.");
    } finally {
      catchingUp.current = false;
    }
  }, [id, refreshMessages]);

  const loadOlder = async () => {
    if (!id || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    setSyncError("");
    preserveScroll.current = { offset: scrollOffset.current, height: contentHeight.current };
    try {
      const result = await api<{ items: ChatMessage[]; nextCursor: string | null }>(`/chat/conversations/${encodeURIComponent(id)}/messages?limit=50&before=${encodeURIComponent(nextCursor)}`);
      setMessages((current) => {
        const existing = new Set(current.map((message) => message.id));
        return [...result.items.filter((message) => !existing.has(message.id)), ...current];
      });
      setNextCursor(result.nextCursor);
      try {
        const read = await api<{ markedRead: number; readAt: string }>(`/chat/conversations/${encodeURIComponent(id)}/read`, { method: "POST" });
        if (read.markedRead > 0) setMessages((current) => current.map((message) => !message.isMine && !message.readAt ? { ...message, readAt: read.readAt } : message));
      } catch {
        // Keep the loaded older page if read-state sync is temporarily unavailable.
      }
    } catch {
      preserveScroll.current = null;
      setSyncError("Could not load older messages. Check your connection and try again.");
    } finally {
      setLoadingOlder(false);
    }
  };

  const load = useCallback(async () => {
    if (!id) {
      setError("CHAT_CONVERSATION_NOT_FOUND");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setSyncError("");
    try {
      const response = await api<{ items: ChatConversation[] }>("/chat/conversations?limit=100");
      const item = response.items.find((entry) => entry.id === id);
      if (!item) throw new Error("CHAT_CONVERSATION_NOT_FOUND");
      setConversation(item);
      await refreshMessages();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_FAILED");
    } finally {
      setLoading(false);
    }
  }, [id, refreshMessages]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    if (!conversation) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [conversation]);

  useEffect(() => {
    if (!conversation?.id) return;
    let active = true;
    const channel = supabase.channel(`chat:${conversation.id}`, { config: { private: true } })
      .on("broadcast", { event: "message.created" }, ({ payload }) => {
        if (!active || typeof payload?.id !== "string" || typeof payload?.content !== "string" || typeof payload?.createdAt !== "string") {
          if (active) void catchUp();
          return;
        }
        const message: ChatMessage = { id: payload.id, senderName: typeof payload.senderName === "string" ? payload.senderName : "CareNow participant", content: payload.content, createdAt: payload.createdAt, readAt: null, isMine: payload.senderRole === "PATIENT" };
        setMessages((current) => mergeMessages(current, [message]));
        setConversation((current) => current ? { ...current, lastMessage: message.content, lastMessageAt: message.createdAt, unreadCount: 0 } : current);
        stickToBottom.current = true;
        if (!message.isMine) {
          void api<{ readAt: string }>(`/chat/conversations/${encodeURIComponent(conversation.id)}/read`, { method: "POST" }).then(({ readAt }) => {
            setMessages((current) => current.map((item) => item.id === message.id ? { ...item, readAt } : item));
          }).catch(() => undefined);
        }
        void catchUp();
      })
      .on("broadcast", { event: "messages.read" }, ({ payload }) => {
        if (!active || payload?.readerRole === "PATIENT" || typeof payload?.readAt !== "string") return;
        setMessages((current) => current.map((message) => message.isMine && !message.readAt ? { ...message, readAt: payload.readAt } : message));
      });

    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token);
        if (!active) return;
        channel.subscribe((status) => {
          if (!active) return;
          setRealtimeError(status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED");
          if (status === "SUBSCRIBED") void catchUp();
        });
      } catch {
        if (active) setRealtimeError(true);
      }
    })();

    const syncTimer = setInterval(() => {
      if (AppState.currentState === "active") void catchUp();
    }, 5_000);
    const appState = AppState.addEventListener("change", (state) => { if (state === "active") void catchUp(); });

    return () => {
      active = false;
      clearInterval(syncTimer);
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [conversation?.id, catchUp]);

  const opensAt = conversation ? new Date(conversation.availableAt).getTime() : 0;
  const readOnlyAt = conversation ? new Date(conversation.readOnlyAt).getTime() : 0;
  const closedByAppointment = conversation?.appointmentStatus === "CANCELLED" || conversation?.appointmentStatus === "NO_SHOW";
  const canSend = Boolean(conversation && !closedByAppointment && now >= opensAt && now <= readOnlyAt);
  const isReadOnly = Boolean(conversation && (closedByAppointment || now > readOnlyAt));
  const doctorName = useMemo(() => conversation ? doctorDisplayName(conversation.doctorName) : "Messages", [conversation]);

  const sendContent = async (content: string, optimisticId = `local:${newMessageUuid()}`, clientMessageId = optimisticId.replace(/^local:/, "")) => {
    if (!id || !content || sending || !canSend) return;
    setSending(true);
    setError("");
    setSyncError("");
    setMessages((current) => current.map((message) => message.id === optimisticId ? { ...message, delivery: "sending" } : message));
    try {
      const result = await api<{ item: ChatMessage }>(`/chat/conversations/${encodeURIComponent(id)}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, clientMessageId }),
      });
      stickToBottom.current = true;
      setMessages((current) => mergeMessages(current.filter((message) => message.id !== optimisticId), [result.item]));
      setConversation((current) => current ? { ...current, lastMessage: content, lastMessageAt: result.item.createdAt, unreadCount: 0 } : current);
      void catchUp();
    } catch (cause) {
      setMessages((current) => current.map((message) => message.id === optimisticId ? { ...message, delivery: "failed" } : message));
      setError(cause instanceof Error ? cause.message : "Your message could not be sent.");
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    const content = draft.trim();
    if (!id || !content || sending || !canSend) return;
    const clientMessageId = newMessageUuid();
    const optimisticId = `local:${clientMessageId}`;
    setDraft("");
    stickToBottom.current = true;
    setMessages((current) => mergeMessages(current, [{ id: optimisticId, senderName: "You", content, createdAt: new Date().toISOString(), readAt: null, isMine: true, delivery: "sending" }]));
    await sendContent(content, optimisticId, clientMessageId);
  };

  const appointmentContext = conversation
    ? `${conversation.consultationType === "ONLINE" ? "Online consultation" : `In-person visit${conversation.clinicName ? ` · ${conversation.clinicName}` : ""}`} · ${dateTime(conversation.startsAt)}`
    : "Appointment chat";

  return <>
    <Stack.Screen options={{ title: doctorName }} />
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.wash }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 22 }}
        keyboardShouldPersistTaps="handled"
        onLayout={(event) => { viewportHeight.current = event.nativeEvent.layout.height; }}
        onScroll={(event) => {
          scrollOffset.current = event.nativeEvent.contentOffset.y;
          stickToBottom.current = scrollOffset.current + viewportHeight.current >= contentHeight.current - 80;
        }}
        scrollEventThrottle={16}
        onContentSizeChange={(_, height) => {
          const previous = preserveScroll.current;
          contentHeight.current = height;
          if (previous) {
            scrollRef.current?.scrollTo({ y: previous.offset + Math.max(0, height - previous.height), animated: false });
            scrollOffset.current = previous.offset + Math.max(0, height - previous.height);
            preserveScroll.current = null;
          } else if (stickToBottom.current) {
            scrollRef.current?.scrollToEnd({ animated: true });
          }
        }}
      >
        {conversation ? <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#e8f1ff", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {conversation.doctorPhotoUrl
              ? <Image source={{ uri: conversation.doctorPhotoUrl }} style={{ width: 48, height: 48 }} resizeMode="cover" />
              : <Text style={{ color: colors.blue, fontWeight: "800" }}>{initials(doctorName)}</Text>}
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.label}>{doctorName}</Text>
            <Text style={styles.small}>{conversation.specialty}</Text>
            <Text style={{ color: colors.ink, fontSize: 11, lineHeight: 16 }}>{appointmentContext}</Text>
          </View>
        </Card> : null}

        <Card style={{ flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#eff6ff" }}>
          <Text style={{ color: colors.blue, fontSize: 17, fontWeight: "800" }}>i</Text>
          <Copy small>Chat is for appointment follow-up. For emergencies, contact local emergency services.</Copy>
        </Card>

        {conversation && !canSend && !isReadOnly ? <Card style={{ backgroundColor: "#f1f7ff" }}><Text style={{ color: colors.blue, fontWeight: "700", fontSize: 13 }}>Messaging opens 15 minutes before your appointment</Text><Copy small>You can read this conversation now. Sending becomes available {dateTime(conversation.availableAt)}.</Copy></Card> : null}
        {isReadOnly ? <Card style={{ backgroundColor: "#f4f6fa" }}><Text style={{ color: colors.muted, fontWeight: "700", fontSize: 13 }}>This conversation is read-only</Text><Copy small>{closedByAppointment ? "The appointment was cancelled or marked as a no-show." : "The messaging period ended seven days after the appointment."}</Copy></Card> : null}
        {realtimeError ? <Card style={{ paddingVertical: 10, gap: 7 }}><Copy small>Live connection is reconnecting. CareNow checks for new messages automatically.</Copy></Card> : null}

        {loading && !conversation ? <Card style={{ alignItems: "center", paddingVertical: 26 }}><ActivityIndicator color={colors.blue} /><Copy small>Loading conversation…</Copy></Card> : null}
        {error && !conversation ? <Card style={{ gap: 10 }}><ErrorText error={error} /><Pressable accessibilityRole="button" onPress={() => void load()}><Text style={{ color: colors.blue, fontWeight: "700" }}>Try again</Text></Pressable></Card> : null}
        {error && conversation ? <Card style={{ gap: 10 }}><ErrorText error={error} /><Pressable accessibilityRole="button" onPress={() => void load()}><Text style={{ color: colors.blue, fontWeight: "700" }}>Try again</Text></Pressable></Card> : null}
        {!loading && !error && messages.length === 0 ? <Card style={{ alignItems: "center", paddingVertical: 24, gap: 5 }}><Text style={{ color: colors.blue, fontSize: 25 }}>♡</Text><Text style={{ color: colors.navy, fontWeight: "700" }}>No messages yet</Text><Copy small>{canSend ? "Send a message to start your conversation." : "Messages will appear here when you and your doctor begin chatting."}</Copy></Card> : null}

        {nextCursor ? <Pressable accessibilityRole="button" disabled={loadingOlder} onPress={() => void loadOlder()} style={{ alignSelf: "center", padding: 8 }}>
          <Text style={{ color: colors.blue, fontSize: 12, fontWeight: "700" }}>{loadingOlder ? "Loading older messages…" : "Load older messages"}</Text>
        </Pressable> : null}

        {messages.map((message) => <View key={message.id} style={{ alignItems: message.isMine ? "flex-end" : "flex-start" }}>
          <View style={{ maxWidth: "86%", paddingVertical: 10, paddingHorizontal: 13, borderRadius: 16, borderBottomRightRadius: message.isMine ? 5 : 16, borderBottomLeftRadius: message.isMine ? 16 : 5, backgroundColor: message.isMine ? colors.blue : colors.white, borderWidth: message.isMine ? 0 : 1, borderColor: colors.line }}>
            {!message.isMine ? <Text style={{ color: colors.blue, fontSize: 11, fontWeight: "700", marginBottom: 3 }}>{message.senderName}</Text> : null}
            <Text style={{ color: message.isMine ? colors.white : colors.ink, fontSize: 14, lineHeight: 20 }}>{message.content}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, marginHorizontal: 3 }}><Text style={{ color: message.delivery === "failed" ? colors.red : colors.muted, fontSize: 10 }}>{messageTime(message.createdAt)}{message.isMine ? ` · ${message.delivery === "sending" ? "Sending…" : message.delivery === "failed" ? "Not sent" : message.readAt ? "Read" : "Sent"}` : ""}</Text>{message.delivery === "failed" ? <Pressable accessibilityRole="button" onPress={() => void sendContent(message.content, message.id)}><Text style={{ color: colors.blue, fontWeight: "700", fontSize: 11 }}>Retry</Text></Pressable> : null}</View>
        </View>)}
        {syncError ? <Text style={{ color: colors.red, fontSize: 12 }}>{syncError}</Text> : null}
      </ScrollView>

      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 9, paddingHorizontal: 14, paddingTop: 10, paddingBottom: Platform.OS === "ios" ? 18 : 12, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={isReadOnly ? "This conversation is read-only" : canSend ? "Type a message…" : "Messaging opens 15 minutes before"}
          placeholderTextColor={colors.muted}
          editable={canSend && !sending}
          multiline
          maxLength={4000}
          textAlignVertical="center"
          style={{ flex: 1, maxHeight: 108, minHeight: 44, borderWidth: 1, borderColor: colors.line, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, color: colors.ink, fontSize: 14, backgroundColor: canSend ? colors.white : "#f3f6fa" }}
          onSubmitEditing={() => void send()}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={!canSend || !draft.trim() || sending} onPress={() => void send()} style={{ minWidth: 50, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: canSend && draft.trim() ? colors.blue : "#c5d0df" }}>
          {sending ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={{ color: colors.white, fontSize: 13, fontWeight: "800" }}>Send</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  </>;
}
