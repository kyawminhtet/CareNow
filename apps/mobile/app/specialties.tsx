import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { Page, Copy, ErrorText } from "../components/ui";
import { api, type Specialty } from "../lib/api";
import { colors } from "../lib/theme";

export default function SpecialtiesScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = (screenWidth - 40 - 10) / 3;
  const [items, setItems] = useState<Specialty[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api<{ items: Specialty[] }>("/public/specialties")
      .then((response) => { setItems(response.items); setError(""); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load specialties"))
      .finally(() => setLoading(false));
  }, []);

  return <Page>
    <Copy>Choose a specialty to find a CareNow doctor.</Copy>
    {error ? <ErrorText error={error} /> : loading ? <Copy>Loading specialties…</Copy> : items.length === 0 ? <Copy>Specialties will appear here when they are available.</Copy> : <View style={styles.grid}>
      {items.map((item) => <Pressable key={item.id} onPress={() => router.push({ pathname: "/specialty/[id]", params: { id: item.id, name: item.name } })} style={({ pressed }) => [styles.card, { width: cardWidth, opacity: pressed ? 0.82 : 1 }]}>
        {item.photoUrl ? <Image source={{ uri: item.photoUrl }} style={styles.photo} resizeMode="cover" /> : <View style={styles.placeholder}><Text style={styles.placeholderMark}>✚</Text></View>}
        <Text numberOfLines={2} style={styles.name}>{item.name}</Text>
      </Pressable>)}
    </View>}
  </Page>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", columnGap: 5, rowGap: 5 },
  card: { height: 140, backgroundColor: colors.white, borderRadius: 15, borderWidth: 1, borderColor: colors.line, padding: 7, gap: 7, shadowColor: "#203c66", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  photo: { width: "100%", height: 88, borderRadius: 10, backgroundColor: "#eaf3ff" },
  placeholder: { width: "100%", height: 88, borderRadius: 10, backgroundColor: "#eaf3ff", alignItems: "center", justifyContent: "center" },
  placeholderMark: { color: colors.blue, fontSize: 30, fontWeight: "800" },
  name: { minHeight: 34, color: colors.navy, fontSize: 12, lineHeight: 16, fontWeight: "700", textAlign: "center" },
});
