import { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api, doctorDisplayName, type Appointment } from "../../lib/api";
import { colors } from "../../lib/theme";
import { CalendarIcon, ClockIcon, LocationPinIcon, VideoIcon } from "../../components/icons";
import { Button, Card, Copy, Page, Title } from "../../components/ui";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timeZone = "Asia/Yangon";

function appointmentDate(value: string) {
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone }).format(new Date(value));
}

function appointmentTime(value: string) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(value));
}

export default function AppointmentConfirmed() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const validId = typeof id === "string" && UUID.test(id);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!validId || !id) {
      setLoadFailed(true);
      return;
    }
    let active = true;
    api<{ item: Appointment }>(`/patient/appointments/${encodeURIComponent(id)}`)
      .then((result) => { if (active) setAppointment(result.item); })
      .catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; };
  }, [id, validId]);

  const openDirections = async () => {
    if (!appointment) return;
    const address = [appointment.clinicName, appointment.clinicAddress, appointment.clinicCity].filter(Boolean).join(", ");
    await Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(address)}`);
  };

  return <Page contentStyle={{ paddingTop: 18, gap: 18, alignItems: "stretch" }}>
    <View style={{ alignItems: "center", gap: 10, paddingTop: 14, paddingBottom: 4 }}>
      <View accessibilityLabel="Appointment confirmed" accessibilityRole="image" style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: "#e2f7ef", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#c8eddf" }}>
        <Text style={{ color: colors.green, fontSize: 54, fontWeight: "800", lineHeight: 62 }}>✓</Text>
      </View>
      <Title size={25}>Appointment confirmed</Title>
      <Copy>Your appointment is booked. We look forward to helping you.</Copy>
    </View>

    {appointment ? <Card style={{ gap: 0, padding: 18 }}>
      <View style={{ paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 5 }}>
        <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7 }}>Your doctor</Text>
        <Text style={{ color: colors.navy, fontSize: 18, fontWeight: "800" }}>{doctorDisplayName(appointment.doctorName)}</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{appointment.specialty}</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: "#edf4ff", alignItems: "center", justifyContent: "center" }}><CalendarIcon color={colors.blue} /></View>
        <View style={{ flex: 1, gap: 4 }}><Text style={{ color: colors.muted, fontSize: 11 }}>Date</Text><Text style={{ color: colors.ink, fontSize: 14, fontWeight: "700" }}>{appointmentDate(appointment.startsAt)}</Text></View>
      </View>

      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: "#edf4ff", alignItems: "center", justifyContent: "center" }}><ClockIcon color={colors.blue} /></View>
        <View style={{ flex: 1, gap: 4 }}><Text style={{ color: colors.muted, fontSize: 11 }}>Time</Text><Text style={{ color: colors.ink, fontSize: 14, fontWeight: "700" }}>{appointmentTime(appointment.startsAt)} <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "500" }}>(Yangon time)</Text></Text></View>
      </View>

      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", paddingTop: 14 }}>
        <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: appointment.consultationType === "ONLINE" ? "#edf4ff" : "#e9f8f5", alignItems: "center", justifyContent: "center" }}>
          {appointment.consultationType === "ONLINE" ? <VideoIcon color={colors.blue} /> : <LocationPinIcon color={colors.teal} />}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.muted, fontSize: 11 }}>{appointment.consultationType === "ONLINE" ? "Consultation type" : "Clinic"}</Text>
          <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "700" }}>{appointment.consultationType === "ONLINE" ? "Online consultation" : appointment.clinicName || "In-person visit"}</Text>
          {appointment.consultationType === "IN_PERSON" && appointment.clinicAddress ? <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{appointment.clinicAddress}{appointment.clinicCity ? `, ${appointment.clinicCity}` : ""}</Text> : null}
          {appointment.consultationType === "IN_PERSON" && (appointment.clinicAddress || appointment.clinicCity) ? <Pressable accessibilityRole="link" onPress={() => void openDirections()} style={{ alignSelf: "flex-start", paddingTop: 3 }}><Text style={{ color: colors.blue, fontSize: 12, fontWeight: "700" }}>Get directions  ↗</Text></Pressable> : null}
        </View>
      </View>
    </Card> : <Card><Copy>{loadFailed ? "Your booking is confirmed. You can view it from My Appointments." : "Loading your appointment details…"}</Copy></Card>}

    <Card style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#f1f7ff", borderColor: "#d9e9ff" }}>
      <Text style={{ color: colors.blue, fontSize: 18, fontWeight: "800" }}>i</Text>
      <Copy small>We’ll remind you before your appointment. You can find the details anytime in My Appointments.</Copy>
    </Card>

    {appointment
      ? <Button title="View appointment details" onPress={() => router.replace({ pathname: "/appointment/[id]", params: { id: appointment.id } })} />
      : <Button title="View My Appointments" onPress={() => router.replace("/(tabs)/appointments")} />}
    <Pressable accessibilityRole="button" onPress={() => router.replace("/(tabs)/home")} style={{ alignSelf: "center", paddingHorizontal: 16, paddingVertical: 9 }}><Text style={{ color: colors.blue, fontSize: 14, fontWeight: "700" }}>Back to Home</Text></Pressable>
  </Page>;
}
