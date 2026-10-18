import { useCallback, useEffect, useState } from "react";
import { Link, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, dateTime, type Doctor, type Specialty } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, styles } from "../../lib/theme";
import { Card, Copy, Empty, humanize, Page, Title } from "../../components/ui";
import { BellIcon, LocationPinIcon, VideoIcon } from "../../components/icons";

type HomeAppointment = { id: string; doctorName: string; specialty: string; startsAt: string; consultationType?: "ONLINE" | "IN_PERSON" };

const specialtyLooks = [
  { icon: "♧", tint: "#e8f2ff", color: "#2877e8" },
  { icon: "♙", tint: "#f1eaff", color: "#8a55d6" },
  { icon: "✿", tint: "#e5f7f1", color: "#169b82" },
  { icon: "♡", tint: "#fff0f4", color: "#e65389" },
];

export default function Home() {
  const insets = useSafeAreaInsets();
  const { displayName } = useAuth();
  const [greeting, setGreeting] = useState(() => localGreeting(new Date()));
  const { specialty: specialtyParam } = useLocalSearchParams<{ specialty?: string }>();
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [language, setLanguage] = useState("");
  const [clinic, setClinic] = useState("");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [specialtyCatalog, setSpecialtyCatalog] = useState<Specialty[]>([]);
  const [upcoming, setUpcoming] = useState<HomeAppointment[]>([]);
  const [error, setError] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setGreeting(localGreeting(new Date())), 60_000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    try {
      const [doctorResponse, appointmentResponse, specialtyResponse] = await Promise.all([
        api<{ items: Doctor[] }>("/patient/doctors"),
        api<{ items: HomeAppointment[] }>("/patient/appointments?status=UPCOMING"),
        api<{ items: Specialty[] }>("/public/specialties").catch(() => ({ items: [] })),
      ]);
      setDoctors(doctorResponse.items);
      setUpcoming(appointmentResponse.items.slice(0, 1));
      setSpecialtyCatalog(specialtyResponse.items);
      setError("");
      setToastVisible(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load CareNow");
      setToastVisible(true);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    if (!error || !toastVisible) return;
    const timeout = setTimeout(() => setToastVisible(false), 7000);
    return () => clearTimeout(timeout);
  }, [error, toastVisible]);
  useEffect(() => { if (typeof specialtyParam === "string") setSpecialty(specialtyParam); }, [specialtyParam]);
  const specialties = specialtyCatalog.length ? specialtyCatalog : [...new Set(doctors.map((doctor) => doctor.specialty).filter(Boolean))].map((name, index) => ({ id: `${name}-${index}`, name, photoUrl: null }));
  const languages = [...new Set(doctors.flatMap((doctor) => doctor.languages ?? []))];
  const visibleLanguages = languages.filter((item) => !["burmese", "english"].includes(item.trim().toLowerCase()));
  const clinics = [...new Set(doctors.flatMap((doctor) => doctor.clinicNames ?? []))];
  const filtered = doctors.filter((doctor) =>
    `${doctor.name} ${doctor.specialty}`.toLowerCase().includes(query.toLowerCase()) &&
    (!specialty || doctor.specialty === specialty) &&
    (!language || doctor.languages?.includes(language)) &&
    (!clinic || doctor.clinicNames?.includes(clinic)),
  );

  return <View style={{ flex:  1 }}><Page contentStyle={{ paddingTop: insets.top + 8 }}>
    <View style={home.header}>
      <Text style={home.brand}><Text style={{ color: colors.blue }}>Care</Text><Text style={{ color: colors.teal }}>Now</Text></Text>
      <Pressable accessibilityLabel="Notifications" onPress={() => router.push("/notifications")} style={home.bellButton}>
        <BellIcon color={colors.navy} />
        <View style={home.notificationDot} />
      </Pressable>
    </View>

    <View style={home.greetingBlock}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={home.greeting}>
        {greeting}, <Text style={home.patientName}>{firstName(displayName) || "May"}.</Text>
      </Text>
      <Text style={home.helper}>How can we help you today?</Text>
    </View>

    <View style={home.searchBox}>
      <Text style={home.searchIcon}>⌕</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search doctors, specialties..."
        placeholderTextColor="#8b9ab0"
        style={home.searchInput}
        returnKeyType="search"
      />
      {query.length > 0 && <Pressable accessibilityLabel="Clear search" onPress={() => setQuery("")}><Text style={home.clearSearch}>×</Text></Pressable>}
    </View>

    <View style={home.consultationRow}>
      <ConsultationCard
        title="Online consultation"
        detail="See a doctor online"
        icon="video"
        tint="#eaf3ff"
        color={colors.blue}
        href={{ pathname: "/consultation/[type]", params: { type: "ONLINE" } }}
      />
      <ConsultationCard
        title="In-person visit"
        detail="At our clinics"
        icon="location"
        tint="#e5f7f2"
        color={colors.teal}
        href={{ pathname: "/consultation/[type]", params: { type: "IN_PERSON" } }}
      />
    </View>

    <View style={home.sectionHeading}>
      <Text style={home.sectionTitle}>Popular specialties</Text>
      <Link href="/specialties" asChild><Pressable accessibilityRole="link" hitSlop={12}><Text style={home.link}>See all</Text></Pressable></Link>
    </View>
    {specialties.length > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={home.specialtyRail}>
      {specialties.slice(0, 8).map((item, index) => {
        const look = specialtyLooks[index % specialtyLooks.length];
        const selected = specialty === item.name;
        return <Pressable key={item.id} onPress={() => setSpecialty(selected ? "" : item.name)} style={home.specialtyItem}>
          <View style={[home.specialtyIcon, { backgroundColor: selected ? look.color : look.tint }]}>{item.photoUrl ? <Image source={{ uri: item.photoUrl }} style={home.specialtyPhoto} resizeMode="cover" /> : <Text style={[home.specialtyGlyph, { color: selected ? colors.white : look.color }]}>{look.icon}</Text>}</View>
          <Text numberOfLines={2} style={home.specialtyLabel}>{item.name}</Text>
        </Pressable>;
      })}
    </ScrollView> : <Text style={home.emptySpecialties}>Specialties will appear as doctors join CareNow.</Text>}

    {(visibleLanguages.length > 0 || clinics.length > 0) && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={home.filterRail}>
      {visibleLanguages.map((item) => <FilterChip key={item} label={item} selected={language === item} onPress={() => setLanguage(language === item ? "" : item)} />)}
      {clinics.map((item) => <FilterChip key={item} label={item} selected={clinic === item} onPress={() => setClinic(clinic === item ? "" : item)} />)}
    </ScrollView>}

    <View style={home.sectionHeading}>
      <Text style={home.sectionTitle}>Upcoming appointment</Text>
      <Pressable onPress={() => router.push("/(tabs)/appointments")}><Text style={home.link}>See all</Text></Pressable>
    </View>
    {upcoming.length > 0 ? <UpcomingCard appointment={upcoming[0]} /> : <Pressable onPress={() => router.push("/(tabs)/appointments")} style={home.noAppointment}>
      <View style={home.noAppointmentIcon}><Text style={{ color: colors.blue, fontSize: 19 }}>▣</Text></View>
      <View style={{ flex: 1 }}><Text style={home.noAppointmentTitle}>No upcoming appointments</Text><Text style={home.noAppointmentCopy}>Find a doctor and book a time that works for you.</Text></View>
      <Text style={{ color: colors.blue, fontSize: 22 }}>›</Text>
    </Pressable>}

    <View style={[home.sectionHeading, { marginTop: 5 }]}>
      <Text style={home.sectionTitle}>Doctors for you</Text>
      <Text style={home.resultCount}>{filtered.length} {filtered.length === 1 ? "doctor" : "doctors"}</Text>
    </View>
    {!error ? filtered.length === 0 ? <Empty title="No doctors found" detail="Try another search or specialty, or check back soon." /> : filtered.map((doctor) =>
      <Pressable key={doctor.id} onPress={() => router.push(`/doctor/${doctor.id}`)}><Card style={home.doctorCard}>
        <View style={home.doctorRow}>
          <View style={home.doctorAvatar}>{doctor.profilePhotoUrl ? <Image source={{ uri: doctor.profilePhotoUrl }} style={home.doctorAvatarImage} /> : <Text style={home.doctorInitials}>{initials(doctor.name)}</Text>}</View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={home.doctorName}>Dr. {doctor.name}</Text>
            <Text style={home.doctorSpecialty}>{doctor.specialty}</Text>
            <Text style={home.doctorMeta}>{doctor.experienceYears ? `${doctor.experienceYears} years experience · ` : ""}{doctor.languages?.join(", ") || "CareNow verified"}</Text>
          </View>
          <Text style={{ fontSize: 24, color: colors.blue }}>›</Text>
        </View>
        <View style={home.servicesRow}>{doctor.services?.map((service) => <View key={service} style={home.servicePill}><Text style={home.serviceText}>{service === "IN_PERSON" ? "In-person" : "Online"}</Text></View>)}</View>
        {doctor.nextAvailableAt && <Text style={home.availability}>Next available · {dateTime(doctor.nextAvailableAt)}</Text>}
      </Card></Pressable>,
    ) : null}
  </Page>
  {error && toastVisible ? <View pointerEvents="box-none" style={[home.toastOverlay, { bottom: insets.bottom + 82 }]}>
    <View accessibilityRole="alert" style={home.toast}>
      <View style={home.toastIcon}><Text style={{ color: colors.white, fontSize: 13, fontWeight: "800" }}>!</Text></View>
      <View style={{ flex: 1, gap: 3 }}><Text style={home.toastTitle}>Connection issue</Text><Text style={home.toastMessage}>{humanize(error)}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Try loading again" onPress={() => void load()} hitSlop={8} style={home.toastRetry}><Text style={home.toastRetryText}>Retry</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss message" onPress={() => setToastVisible(false)} hitSlop={8} style={{ padding: 4 }}><Text style={{ color: colors.muted, fontSize: 20, lineHeight: 20 }}>×</Text></Pressable>
    </View>
  </View> : null}
  </View>;
}

function ConsultationCard({ title, detail, icon, tint, color, href }: { title: string; detail: string; icon: "video" | "location"; tint: string; color: string; href: { pathname: "/consultation/[type]"; params: { type: "ONLINE" | "IN_PERSON" } } }) {
  return <Link href={href} asChild><Pressable accessibilityRole="link" style={StyleSheet.flatten([home.consultationCard, { backgroundColor: tint, borderColor: "transparent" }])}>
    <View style={[home.consultationIcon, { backgroundColor: `${color}18` }]}>{icon === "video" ? <VideoIcon color={color} /> : <LocationPinIcon color={color} />}</View>
    <Text style={home.consultationTitle}>{title}</Text>
    <Text style={home.consultationDetail}>{detail}</Text>
  </Pressable></Link>;
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[home.filterChip, { backgroundColor: selected ? colors.blue : colors.white, borderColor: selected ? colors.blue : colors.line }]}><Text style={{ color: selected ? colors.white : colors.muted, fontSize: 12, fontWeight: "600" }}>{label}</Text></Pressable>;
}

function UpcomingCard({ appointment }: { appointment: HomeAppointment }) {
  const online = appointment.consultationType !== "IN_PERSON";
  return <Pressable onPress={() => router.push(`/(tabs)/appointments`)} style={home.upcomingCard}>
    <View style={[home.upcomingIcon, { backgroundColor: online ? "#e9f2ff" : "#e4f7f1" }]}>{online ? <VideoIcon color={colors.blue} /> : <LocationPinIcon color={colors.teal} />}</View>
    <View style={{ flex: 1, gap: 3 }}>
      <Text style={home.upcomingDoctor}>Dr. {appointment.doctorName}</Text>
      <Text style={home.upcomingSpecialty}>{appointment.specialty}</Text>
      <Text style={home.upcomingDate}>{dateTime(appointment.startsAt)}</Text>
    </View>
    <View style={home.upcomingRight}>
      <View style={[home.typeBadge, { backgroundColor: online ? "#d8f4eb" : "#e4f7f1" }]}><Text style={[home.typeBadgeText, { color: colors.teal }]}>{online ? "Online" : "In person"}</Text></View>
      <Text style={{ color: colors.muted, fontSize: 23 }}>›</Text>
    </View>
  </Pressable>;
}

function firstName(name: string) { return name.trim().split(/\s+/)[0] ?? ""; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function localGreeting(date: Date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

const home = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: -5 },
  brand: { fontSize: 25, fontWeight: "900", letterSpacing: -0.8 },
  bellButton: { width: 43, height: 43, borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: "#edf1f7", alignItems: "center", justifyContent: "center" },
  notificationDot: { position: "absolute", top: 7, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef5065", borderWidth: 1, borderColor: colors.white },
  greetingBlock: { gap: 1, marginTop: 1 },
  greeting: { color: colors.navy, fontSize: 16, fontWeight: "700" },
  patientName: { fontWeight: "800" },
  helper: { color: colors.muted, fontSize: 13, marginTop: 1 },
  searchBox: { height: 46, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: "#dfe7f2", flexDirection: "row", alignItems: "center", paddingHorizontal: 13, gap: 9, shadowColor: "#315b99", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  searchIcon: { color: "#6a7d99", fontSize: 25, lineHeight: 29 },
  searchInput: { flex: 1, height: "100%", color: colors.navy, fontSize: 13, paddingVertical: 0 },
  clearSearch: { color: colors.muted, fontSize: 22, paddingHorizontal: 3 },
  consultationRow: { flexDirection: "row", gap: 11 },
  consultationCard: { flex: 1, minHeight: 120, borderRadius: 17, borderWidth: 1.5, padding: 13, gap: 4 },
  consultationIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  consultationTitle: { color: colors.navy, fontSize: 13, fontWeight: "800" },
  consultationDetail: { color: colors.muted, fontSize: 11 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  sectionTitle: { color: colors.navy, fontSize: 16, fontWeight: "800" },
  link: { color: colors.blue, fontSize: 12, fontWeight: "700" },
  specialtyRail: { gap: 16, paddingVertical: 2, paddingHorizontal: 2 },
  specialtyItem: { width: 66, alignItems: "center", gap: 5 },
  specialtyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  specialtyPhoto: { width: 52, height: 52, borderRadius: 26 },
  specialtyGlyph: { fontSize: 25, fontWeight: "700" },
  specialtyLabel: { color: colors.ink, fontSize: 11, lineHeight: 14, textAlign: "center", minHeight: 28 },
  emptySpecialties: { color: colors.muted, fontSize: 12 },
  filterRail: { gap: 7, paddingBottom: 1 },
  filterChip: { borderWidth: 1, borderRadius: 18, paddingVertical: 7, paddingHorizontal: 11 },
  upcomingCard: { minHeight: 91, borderRadius: 17, backgroundColor: colors.white, borderWidth: 1, borderColor: "#e2eaf4", padding: 12, flexDirection: "row", alignItems: "center", gap: 10, shadowColor: "#315b99", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  upcomingIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  upcomingDoctor: { color: colors.navy, fontSize: 13, fontWeight: "800" },
  upcomingSpecialty: { color: colors.muted, fontSize: 11 },
  upcomingDate: { color: "#51647f", fontSize: 11, marginTop: 2 },
  upcomingRight: { alignItems: "flex-end", justifyContent: "space-between", alignSelf: "stretch" },
  typeBadge: { borderRadius: 10, paddingVertical: 4, paddingHorizontal: 8 },
  typeBadgeText: { fontSize: 10, fontWeight: "700" },
  noAppointment: { minHeight: 82, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  noAppointmentIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: "#eaf3ff", alignItems: "center", justifyContent: "center" },
  noAppointmentTitle: { color: colors.navy, fontSize: 13, fontWeight: "700" },
  noAppointmentCopy: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: 3 },
  resultCount: { color: colors.muted, fontSize: 12 },
  doctorCard: { padding: 13, gap: 10 },
  doctorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  doctorAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#e7f2ff", alignItems: "center", justifyContent: "center" },
  doctorAvatarImage: { width: 48, height: 48, borderRadius: 24 },
  doctorInitials: { color: colors.blue, fontWeight: "800", fontSize: 15 },
  doctorName: { color: colors.navy, fontSize: 14, fontWeight: "800" },
  doctorSpecialty: { color: colors.muted, fontSize: 12 },
  doctorMeta: { color: "#7888a0", fontSize: 10 },
  servicesRow: { flexDirection: "row", gap: 6 },
  servicePill: { backgroundColor: "#eff6ff", borderRadius: 10, paddingVertical: 4, paddingHorizontal: 8 },
  serviceText: { color: colors.blue, fontSize: 10, fontWeight: "700" },
  availability: { color: colors.green, fontSize: 11, fontWeight: "600" },
  toastOverlay: { position: "absolute", left: 14, right: 14, zIndex: 10 },
  toast: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: "#f0d7a8", backgroundColor: "#fffaf0", shadowColor: "#243b5e", shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 7 },
  toastIcon: { width: 27, height: 27, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#d99221" },
  toastTitle: { color: colors.navy, fontSize: 12, fontWeight: "800" },
  toastMessage: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  toastRetry: { paddingHorizontal: 5, paddingVertical: 8 },
  toastRetryText: { color: colors.blue, fontSize: 11, fontWeight: "800" },
});
