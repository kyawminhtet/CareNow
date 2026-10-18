import { View, type ColorValue } from "react-native";
import { colors } from "../lib/theme";

export function BellIcon({ color }: { color: ColorValue }) {
  return <View style={{ width: 22, height: 23, alignItems: "center", justifyContent: "center" }}>
    <View style={{ position: "absolute", top: 3, width: 14, height: 13, borderWidth: 1.7, borderColor: color, borderBottomWidth: 0, borderTopLeftRadius: 8, borderTopRightRadius: 8 }} />
    <View style={{ position: "absolute", top: 13, width: 18, height: 1.7, backgroundColor: color, borderRadius: 2 }} />
    <View style={{ position: "absolute", top: 16, width: 5, height: 3, backgroundColor: color, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }} />
    <View style={{ position: "absolute", top: 1, width: 3, height: 3, borderRadius: 2, backgroundColor: color }} />
  </View>;
}

export function VideoIcon({ color }: { color: ColorValue }) {
  return <View style={{ width: 27, height: 23, justifyContent: "center" }}>
    <View style={{ width: 17, height: 14, borderRadius: 4, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 7, height: 5, borderRadius: 1.5, backgroundColor: "#ffffff" }} />
    </View>
    <View style={{ position: "absolute", right: 0, top: 6, width: 0, height: 0, borderTopWidth: 5, borderBottomWidth: 5, borderLeftWidth: 7, borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: color, borderTopLeftRadius: 2, borderBottomLeftRadius: 2 }} />
  </View>;
}

export function LocationPinIcon({ color }: { color: ColorValue }) {
  return <View style={{ width: 23, height: 25, alignItems: "center" }}>
    <View style={{ position: "absolute", top: 0, width: 16, height: 16, borderRadius: 9, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#ffffff" }} />
    </View>
    <View style={{ position: "absolute", top: 10, width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 12, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: color }} />
  </View>;
}

export function CalendarIcon({ color }: { color: ColorValue }) {
  return <View style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 1.8, borderColor: color, alignItems: "center", overflow: "hidden" }}>
    <View style={{ width: "100%", height: 6, backgroundColor: color, marginTop: 3 }} />
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", width: 12, gap: 2, marginTop: 2 }}>
      {[0, 1, 2, 3].map((dot) => <View key={dot} style={{ width: 3, height: 3, borderRadius: 1, backgroundColor: color }} />)}
    </View>
  </View>;
}

export function ClockIcon({ color }: { color: ColorValue }) {
  return <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.8, borderColor: color, alignItems: "center", justifyContent: "center" }}>
    <View style={{ width: 1.8, height: 6, position: "absolute", top: 4, backgroundColor: color, borderRadius: 2 }} />
    <View style={{ width: 5, height: 1.8, position: "absolute", top: 9, right: 4, backgroundColor: color, borderRadius: 2 }} />
  </View>;
}

export function HomeTabIcon({ color }: { color: ColorValue }) {
  return <View style={{ width: 26, height: 26, alignItems: "center", justifyContent: "center" }}>
    <View style={{ position: "absolute", top: 2, width: 0, height: 0, borderLeftWidth: 12, borderRightWidth: 12, borderBottomWidth: 11, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: color }} />
    <View style={{ position: "absolute", top: 11, width: 17, height: 12, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: color, alignItems: "center", justifyContent: "flex-end" }}>
      <View style={{ width: 5, height: 7, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: colors.white }} />
    </View>
  </View>;
}

export function AppointmentsTabIcon({ color }: { color: ColorValue }) {
  return <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
    <View style={{ width: 19, height: 19, borderRadius: 4, backgroundColor: color, marginTop: 3 }} />
    <View style={{ position: "absolute", top: 8, width: 17, height: 2, backgroundColor: colors.white }} />
    <View style={{ position: "absolute", top: 3, left: 6, width: 2.5, height: 5, borderRadius: 2, backgroundColor: color, borderWidth: 0.6, borderColor: colors.white }} />
    <View style={{ position: "absolute", top: 3, right: 6, width: 2.5, height: 5, borderRadius: 2, backgroundColor: color, borderWidth: 0.6, borderColor: colors.white }} />
    <View style={{ position: "absolute", top: 12, left: 7, width: 3, height: 3, borderRadius: 2, backgroundColor: colors.white }} />
    <View style={{ position: "absolute", top: 12, right: 7, width: 3, height: 3, borderRadius: 2, backgroundColor: colors.white }} />
  </View>;
}

export function MessagesTabIcon({ color }: { color: ColorValue }) {
  return <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
    <View style={{ position: "absolute", bottom: 3, left: 5, width: 7, height: 7, borderRadius: 1, backgroundColor: color, transform: [{ rotate: "18deg" }] }} />
    <View style={{ width: 20, height: 16, borderRadius: 6, backgroundColor: color, alignItems: "center", justifyContent: "center", gap: 2 }}>
      <View style={{ width: 9, height: 2, borderRadius: 2, backgroundColor: colors.white }} />
      <View style={{ width: 6, height: 2, borderRadius: 2, backgroundColor: colors.white }} />
    </View>
  </View>;
}

export function ProfileTabIcon({ color }: { color: ColorValue }) {
  return <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
    <View style={{ position: "absolute", top: 1, width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
    <View style={{ position: "absolute", bottom: 1, width: 20, height: 11, backgroundColor: color, borderTopLeftRadius: 11, borderTopRightRadius: 11, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 }} />
  </View>;
}
