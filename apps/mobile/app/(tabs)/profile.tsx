import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { api } from "../../lib/api";
import { colors, styles } from "../../lib/theme";
import { BellIcon } from "../../components/icons";
import { Button, Card, ErrorText, Field, Page } from "../../components/ui";

type SettingRowProps = {
  icon: ReactNode;
  title: string;
  description?: string;
  onPress: () => void;
  destructive?: boolean;
};

function SettingRow({ icon, title, description, onPress, destructive = false }: SettingRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={description ? `${title}. ${description}` : title}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: description ? 82 : 72,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingHorizontal: 2,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: destructive ? "#fff0f1" : title === "Notification preferences" ? "#e1f7f4" : "#eaf2ff", alignItems: "center", justifyContent: "center" }}>
        {icon}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: destructive ? colors.navy : colors.ink, fontSize: 16, fontWeight: "700" }}>{title}</Text>
        {description ? <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{description}</Text> : null}
      </View>
      <Text accessibilityElementsHidden style={{ color: "#536985", fontSize: 27, lineHeight: 30, marginRight: 5 }}>›</Text>
    </Pressable>
  );
}

function SignOutIcon() {
  return <View style={{ width: 30, height: 30, flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
    <View style={{ width: 15, height: 23, borderLeftWidth: 2.5, borderTopWidth: 2.5, borderBottomWidth: 2.5, borderColor: colors.red, borderTopLeftRadius: 5, borderBottomLeftRadius: 5 }} />
    <Text style={{ color: colors.red, fontSize: 24, fontWeight: "600", marginLeft: -2, marginTop: -2 }}>→</Text>
  </View>;
}

function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";
}

export default function Profile() {
  const { displayName, signOut, refresh } = useAuth();
  const [name, setName] = useState(displayName);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const avatarText = useMemo(() => initials(name || displayName), [name, displayName]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.all([
      api<{ item: { displayName: string; phoneNumber: string | null } }>("/patient/profile"),
      supabase.auth.getUser(),
    ]).then(([profile, user]) => {
      if (!active) return;
      setName(profile.item.displayName);
      setPhone(profile.item.phoneNumber || "");
      setEmail(user.data.user?.email || "");
      setError("");
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load your profile.");
    });
    return () => { active = false; };
  }, []));

  const save = async () => {
    await api("/patient/profile", { method: "PATCH", body: JSON.stringify({ displayName: name, phoneNumber: phone }) });
    await refresh();
  };

  const logout = async () => {
    await signOut();
    router.replace("/(auth)/sign-in");
  };

  return <Page contentStyle={{ paddingTop: 10, paddingBottom: 28 }}>
    <View style={{ gap: 10 }}>
    <Card style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 18, paddingHorizontal: 16 }}>
      <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: "#e5efff", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.navy, fontSize: 29, fontWeight: "600" }}>{avatarText}</Text>
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={{ color: colors.navy, fontSize: 21, fontWeight: "800" }}>{name || displayName}</Text>
        <Text style={{ color: colors.muted, fontSize: 14 }} numberOfLines={1}>{email}</Text>
      </View>
    </Card>

    <Card style={{ padding: 16, gap: 16 }}>
      <Text style={{ color: colors.navy, fontSize: 21, fontWeight: "800", marginBottom: 1 }}>Personal information</Text>
      <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
      <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Button title="Save changes" onPress={save} />
    </Card>

    {error ? <ErrorText error={error} /> : null}

    <Card style={{ padding: 16, gap: 4 }}>
      <Text style={{ color: colors.navy, fontSize: 21, fontWeight: "800", marginBottom: 8 }}>Account settings</Text>
      <SettingRow
        icon={<Text style={{ color: colors.teal, fontSize: 29, lineHeight: 34 }}>⚙︎</Text>}
        title="Notification preferences"
        onPress={() => router.push("/preferences")}
      />
      <View style={{ height: 1, backgroundColor: colors.line, marginLeft: 68 }} />
      <SettingRow
        icon={<BellIcon color={colors.blue} />}
        title="Notifications"
        onPress={() => router.push("/notifications")}
      />
      <View style={{ height: 1, backgroundColor: colors.line, marginLeft: 68 }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Languages" onPress={() => router.push("/languages")} style={({ pressed }) => ({ minHeight: 72, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 2, opacity: pressed ? 0.72 : 1 })}>
        <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: "#eaf2ff", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 25 }}>🌐</Text>
        </View>
        <Text style={{ flex: 1, color: colors.ink, fontSize: 16, fontWeight: "700" }}>Languages</Text>
        <Text accessibilityElementsHidden style={{ color: "#536985", fontSize: 27, lineHeight: 30, marginRight: 5 }}>›</Text>
      </Pressable>
    </Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={() => void logout()}
        style={({ pressed }) => ({ minHeight: 70, marginTop: 4, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 15, backgroundColor: colors.white, opacity: pressed ? 0.72 : 1 })}
      >
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#fff0f1", alignItems: "center", justifyContent: "center" }}><SignOutIcon /></View>
        <Text style={{ flex: 1, color: colors.navy, fontSize: 16, fontWeight: "700" }}>Sign out</Text>
        <Text accessibilityElementsHidden style={{ color: "#536985", fontSize: 27, lineHeight: 30, marginRight: 4 }}>›</Text>
      </Pressable>
    </View>
  </Page>;
}
