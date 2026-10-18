import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Card, Copy, Empty, ErrorText, Page, Title } from "../../components/ui";
import { api, doctorDisplayName, type Doctor } from "../../lib/api";
import { colors } from "../../lib/theme";

export default function SpecialtyDoctorsScreen() {
  const { name: rawName } = useLocalSearchParams<{ id: string; name?: string }>();
  const name = typeof rawName === "string" ? rawName : "";
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!name) { setError("SPECIALTY_NOT_FOUND"); setLoading(false); return; }
    setLoading(true);
    api<{ items: Doctor[] }>(`/patient/doctors?specialty=${encodeURIComponent(name)}`)
      .then((result) => { setDoctors(result.items); setError(""); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load doctors"))
      .finally(() => setLoading(false));
  }, [name]);

  return <Page>
    <View style={{ gap: 4 }}><Title size={24}>{name || "Specialty doctors"}</Title><Copy>CareNow doctors in this specialty.</Copy></View>
    {loading ? <Copy>Finding doctors…</Copy> : error ? <ErrorText error={error} /> : doctors.length === 0 ? <Empty title="No doctors available yet" detail={`There are no active doctors listed for ${name}. Please check back later.`} /> : <>
      <Text style={styles.count}>{doctors.length} {doctors.length === 1 ? "doctor" : "doctors"}</Text>
      {doctors.map((doctor) => <Pressable key={doctor.id} onPress={() => router.push(`/doctor/${doctor.id}`)} accessibilityRole="link">
        <Card style={styles.doctorCard}>
          <View style={styles.row}>
            <View style={styles.avatar}>{doctor.profilePhotoUrl ? <Image source={{ uri: doctor.profilePhotoUrl }} style={styles.photo} resizeMode="cover" /> : <Text style={styles.initials}>{initials(doctor.name)}</Text>}</View>
            <View style={{ flex: 1, gap: 4 }}><Text style={styles.name}>{doctorDisplayName(doctor.name)}</Text><Text style={styles.specialty}>{doctor.specialty}</Text><Text style={styles.meta}>{doctor.qualifications || "CareNow verified physician"}</Text></View>
            <Text style={styles.chevron}>›</Text>
          </View>
          <Copy small>{doctor.experienceYears !== null ? `${doctor.experienceYears} years experience` : "CareNow verified"}{doctor.languages?.length ? ` · ${doctor.languages.join(", ")}` : ""}</Copy>
          <View style={styles.serviceRow}>{doctor.services?.map((service) => <View key={service} style={styles.service}><Text style={styles.serviceText}>{service === "IN_PERSON" ? "In-person" : "Online"}</Text></View>)}</View>
        </Card>
      </Pressable>)}
    </>}
  </Page>;
}

function initials(name: string) {
  return name.trim().replace(/^(?:dr\.?\s*)+/i, "").split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "DR";
}

const styles = StyleSheet.create({
  count: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  doctorCard: { gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 58, height: 58, borderRadius: 18, backgroundColor: "#eaf3ff", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  photo: { width: 58, height: 58 },
  initials: { color: colors.blue, fontSize: 17, fontWeight: "800" },
  name: { color: colors.navy, fontSize: 15, fontWeight: "800" },
  specialty: { color: colors.teal, fontSize: 12, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 11 },
  chevron: { color: colors.blue, fontSize: 25 },
  serviceRow: { flexDirection: "row", gap: 7 },
  service: { backgroundColor: "#eaf3ff", borderRadius: 20, paddingVertical: 5, paddingHorizontal: 10 },
  serviceText: { color: colors.blue, fontSize: 11, fontWeight: "700" },
});
