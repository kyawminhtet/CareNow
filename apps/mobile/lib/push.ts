import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { api } from "./api";

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
export async function enablePush() {
  if (!Device.isDevice) throw new Error("Push notifications require CareNow on a physical device.");
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted") permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") throw new Error("Notification permission was not granted. You can enable it in device settings.");
  const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error("Push service setup is incomplete. Add an EAS project ID before enabling push notifications.");
  const result = await Notifications.getExpoPushTokenAsync({ projectId });
  let installationId = await SecureStore.getItemAsync("carenow-installation-id");
  if (!installationId) { installationId = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`; await SecureStore.setItemAsync("carenow-installation-id", installationId); }
  await api("/patient/devices", { method: "POST", body: JSON.stringify({ installationId, pushToken: result.data, platform: Platform.OS }) });
  return true;
}

export async function unregisterPush() {
  const installationId = await SecureStore.getItemAsync("carenow-installation-id");
  if (installationId) { try { await api(`/patient/devices/${encodeURIComponent(installationId)}`, { method: "DELETE" }); } finally { await SecureStore.deleteItemAsync("carenow-installation-id"); } }
}
