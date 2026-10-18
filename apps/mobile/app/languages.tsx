import { Text, View } from "react-native";
import { Card, Copy, Page, Title } from "../components/ui";
import { colors, styles } from "../lib/theme";

export default function Languages() {
  return (
    <Page>
      <Title>Languages</Title>
      <Copy>Choose the language used in CareNow.</Copy>

      <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ gap: 4 }}>
          <Text style={styles.label}>English</Text>
          <Copy small>Current language</Copy>
        </View>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.white, fontSize: 15, fontWeight: "800" }}>✓</Text>
        </View>
      </Card>

      <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", opacity: 0.65 }}>
        <View style={{ gap: 4 }}>
          <Text style={styles.label}>မြန်မာ</Text>
          <Copy small>Burmese language support is coming soon.</Copy>
        </View>
      </Card>
    </Page>
  );
}
