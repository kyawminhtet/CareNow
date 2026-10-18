import { useCallback, useState } from "react";
import { Alert, Linking, Pressable, Text } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api, dateTime, type Appointment, type ChatConversation } from "../../lib/api";
import { colors } from "../../lib/theme";
import { Button, Card, Copy, ErrorText, Page, Title } from "../../components/ui";

export default function AppointmentDetail() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const validId = typeof id === "string" && /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(id);
  const [item, setItem] = useState<Appointment | null>(null);
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [error, setError] = useState("");
  const [chatError, setChatError] = useState("");

  const load = useCallback(async () => {
    if (!validId || !id) {
      setError("INVALID_APPOINTMENT_ID");
      return;
    }
    setError("");
    const appointmentRequest = api<{ item: Appointment }>(`/patient/appointments/${encodeURIComponent(id)}`)
      .then((response) => setItem(response.item))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "REQUEST_FAILED"));
    const conversationRequest = api<{ items: ChatConversation[] }>("/chat/conversations?limit=100")
      .then((response) => {
        setConversation(response.items.find((entry) => entry.appointmentId === id) ?? null);
        setChatError("");
      })
      .catch((cause) => setChatError(cause instanceof Error ? cause.message : "REQUEST_FAILED"));
    await Promise.all([appointmentRequest, conversationRequest]);
  }, [id, validId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const cancel = () => Alert.alert("Cancel appointment?", "Your selected appointment time will become available again.", [
    { text: "Keep appointment", style: "cancel" },
    { text: "Cancel appointment", style: "destructive", onPress: async () => {
      if (!id) return;
      try {
        await api(`/patient/appointments/${encodeURIComponent(id)}/cancel`, { method: "POST" });
        router.replace("/(tabs)/appointments");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not cancel appointment");
      }
    } },
  ]);

  if (error && !item) return <Page><ErrorText error={error} /><Button title="View my appointments" secondary onPress={() => router.replace("/(tabs)/appointments")} /></Page>;
  if (!item) return <Page><Copy>Loading appointment…</Copy></Page>;

  const online = item.consultationType === "ONLINE";
  const openMap = async () => {
    const query = encodeURIComponent([item.clinicName, item.clinicAddress, item.clinicCity].filter(Boolean).join(", "));
    await Linking.openURL(`https://maps.google.com/?q=${query}`);
  };

  return <Page>
    <Title>Appointment details</Title>
    <Card>
      <Text style={{ color: colors.green, fontWeight: "700" }}>✓  {item.status}</Text>
      <Title size={20}>Dr. {item.doctorName}</Title>
      <Copy>{item.specialty}</Copy>
    </Card>
    <Card><Title size={18}>Date and time</Title><Copy>{dateTime(item.startsAt)}</Copy></Card>
    <Card>
      <Title size={18}>Consultation type</Title>
      <Copy>{online ? "Online consultation" : "In-person consultation"}</Copy>
      {!online ? <>
        <Copy>{item.clinicName}</Copy>
        <Copy>{item.clinicAddress}, {item.clinicCity}</Copy>
        <Pressable onPress={openMap}><Text style={{ color: colors.blue, fontWeight: "700" }}>↗  Get directions</Text></Pressable>
      </> : null}
    </Card>
    {conversation ? <Card style={{ backgroundColor: "#f6faff" }}>
      <Title size={17}>Message your doctor</Title>
      <Copy small>{conversation.canSend ? "Your appointment chat is open." : conversation.readOnly ? "You can still view this conversation." : `Chat opens ${dateTime(conversation.availableAt)}.`}</Copy>
      <Button title={conversation.readOnly ? "View conversation" : "Message doctor"} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: conversation.id } })} />
    </Card> : chatError ? <Card style={{ gap: 8 }}><Copy small>Chat details could not be loaded.</Copy><ErrorText error={chatError} /><Pressable onPress={() => void load()}><Text style={{ color: colors.blue, fontWeight: "700" }}>Try again</Text></Pressable></Card> : null}
    {item.reasonForVisit ? <Card><Title size={17}>Reason for appointment</Title><Copy>{item.reasonForVisit}</Copy></Card> : null}
    {item.status === "SCHEDULED" && online ? <Button title="Join waiting room" onPress={() => router.push(`/waiting-room/${item.id}`)} /> : null}
    {item.status === "SCHEDULED" ? <Button title="Reschedule appointment" secondary onPress={() => router.push({ pathname: `/book/${item.doctorId}`, params: { rescheduleId: item.id } })} /> : null}
    {item.status === "SCHEDULED" ? <Pressable onPress={cancel} style={{ padding: 12 }}><Text style={{ textAlign: "center", color: colors.red, fontWeight: "700" }}>Cancel appointment</Text></Pressable> : null}
    {error ? <ErrorText error={error} /> : null}
    <Card><Title size={17}>Consultation summary</Title><Copy>The doctor’s summary and any released records will appear here after your consultation.</Copy></Card>
  </Page>;
}
