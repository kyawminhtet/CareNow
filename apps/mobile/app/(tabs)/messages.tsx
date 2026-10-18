import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Image, Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api, dateTime, doctorDisplayName, type ChatConversation } from "../../lib/api";
import { colors, styles } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import { Card, Copy, Empty, ErrorText, Page } from "../../components/ui";

function initials(name: string) {
  return name.replace(/^(?:dr\.?\s*)+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function activityTime(conversation: ChatConversation) {
  return dateTime(conversation.lastMessageAt ?? conversation.startsAt);
}

export default function Messages() {
  const [items, setItems] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const seenEvents = useRef(new Map<string, string>());
  const lastRealtimeSyncAt = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api<{ items: ChatConversation[] }>("/chat/conversations?limit=100");
      setItems(response.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_FAILED");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void load();
    }, 15_000);
    const appState = AppState.addEventListener("change", (state) => { if (state === "active") void load(); });
    return () => { clearInterval(timer); appState.remove(); };
  }, [load]);

  const conversationIds = items.map((item) => item.id).sort().join(",");
  useEffect(() => {
    if (!conversationIds) return;
    let active = true;
    const channels: ReturnType<typeof supabase.channel>[] = [];
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token);
        if (!active) return;
        for (const id of conversationIds.split(",")) {
          const channel = supabase.channel(`chat:${id}`, { config: { private: true } })
            .on("broadcast", { event: "message.created" }, ({ payload }) => {
              if (!active || typeof payload?.id !== "string" || typeof payload?.createdAt !== "string" || typeof payload?.content !== "string") return;
              if (seenEvents.current.get(id) === payload.id) return;
              seenEvents.current.set(id, payload.id);
              setItems((current) => current.map((item) => item.id !== id ? item : {
                ...item,
                lastMessage: payload.content,
                lastMessageAt: payload.createdAt,
                unreadCount: payload.senderRole === "DOCTOR" ? item.unreadCount + 1 : item.unreadCount,
              }).sort((a, b) => new Date(b.lastMessageAt ?? b.startsAt).getTime() - new Date(a.lastMessageAt ?? a.startsAt).getTime()));
            })
            .on("broadcast", { event: "messages.read" }, ({ payload }) => {
              if (active && payload?.readerRole === "PATIENT") setItems((current) => current.map((item) => item.id === id ? { ...item, unreadCount: 0 } : item));
            });
          channels.push(channel);
          channel.subscribe((status) => {
            if (!active || status !== "SUBSCRIBED" || Date.now() - lastRealtimeSyncAt.current < 10_000) return;
            lastRealtimeSyncAt.current = Date.now();
            void load();
          });
        }
      } catch { /* Inbox refresh remains available if realtime cannot connect. */ }
    })();
    return () => {
      active = false;
      for (const channel of channels) void supabase.removeChannel(channel);
    };
  }, [conversationIds]);

  return <Page>
    <Copy>Private conversations with your CareNow doctors.</Copy>
    <Card style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#eff6ff" }}>
      <Text style={{ color: colors.blue, fontSize: 18, fontWeight: "800" }}>i</Text>
      <Copy small>Messages are for appointment follow-up, not emergencies.</Copy>
    </Card>

    {loading && items.length === 0 ? <Card style={{ alignItems: "center", paddingVertical: 28 }}><Text style={{ color: colors.muted }}>Loading your conversations…</Text></Card> : null}
    {error ? <Card style={{ gap: 12 }}><ErrorText error={error} /><Pressable onPress={() => void load()} accessibilityRole="button"><Text style={{ color: colors.blue, fontWeight: "700" }}>Try again</Text></Pressable></Card> : null}
    {!loading && !error && items.length === 0 ? <Empty title="No conversations yet" detail="Your appointment chats will appear here after you book with a doctor." /> : null}

    {items.map((conversation) => {
      const doctorName = doctorDisplayName(conversation.doctorName);
      const detail = conversation.consultationType === "ONLINE" ? "Online consultation" : `In-person visit${conversation.clinicName ? ` · ${conversation.clinicName}` : ""}`;
      return <Pressable key={conversation.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/chat/[id]", params: { id: conversation.id } })}>
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#e8f1ff", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {conversation.doctorPhotoUrl
                ? <Image source={{ uri: conversation.doctorPhotoUrl }} style={{ width: 52, height: 52 }} resizeMode="cover" />
                : <Text style={{ color: colors.blue, fontWeight: "800", fontSize: 15 }}>{initials(doctorName)}</Text>}
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text numberOfLines={1} style={styles.label}>{doctorName}</Text>
              <Text numberOfLines={1} style={styles.small}>{conversation.specialty}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10 }}>{activityTime(conversation)}</Text>
              {conversation.unreadCount > 0 ? <View style={{ minWidth: 21, height: 21, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.white, fontSize: 11, fontWeight: "800" }}>{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</Text></View> : null}
            </View>
          </View>

          <View style={{ paddingLeft: 64, gap: 5 }}>
            <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 12, fontWeight: "700" }}>{detail} · {dateTime(conversation.startsAt)}</Text>
            <Text numberOfLines={2} style={{ color: conversation.lastMessage ? colors.muted : colors.blue, fontSize: 13, lineHeight: 18 }}>
              {conversation.lastMessage || (conversation.canSend ? "Start a conversation with your doctor" : `Messaging opens ${dateTime(conversation.availableAt)}`)}
            </Text>
          </View>
        </Card>
      </Pressable>;
    })}
  </Page>;
}
