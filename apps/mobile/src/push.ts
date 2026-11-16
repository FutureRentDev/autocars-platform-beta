import Constants from "expo-constants";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { brand, type ApiClient } from "@autocars/core";
const key = `${brand.slug}.pushSubscription`;
export const nativePushAvailable =
  Constants.executionEnvironment !== "storeClient";
export async function enableNativePush(api: ApiClient) {
  if (!nativePushAvailable)
    throw new Error(
      "Remote push notifications need your own development or production build. Expo Go can still test the other app features.",
    );
  const projectId =
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId)
    throw new Error(
      "Link this build to your Expo project before enabling push notifications.",
    );
  const notifications = await import("expo-notifications");
  if (Platform.OS === "android")
    await notifications.setNotificationChannelAsync("marketplace", {
      name: "Marketplace updates",
      importance: notifications.AndroidImportance.HIGH,
    });
  const permission = await notifications.requestPermissionsAsync();
  if (permission.status !== "granted")
    throw new Error(
      "Notifications are not permitted. Enable them in your device settings.",
    );
  const token = (await notifications.getExpoPushTokenAsync({ projectId })).data;
  const r = await api.post("/me/push", { platform: "expo", token });
  await SecureStore.setItemAsync(key, r.id);
  return r.id;
}
export async function disableNativePush(api: ApiClient) {
  const id = await SecureStore.getItemAsync(key);
  if (id) await api.delete(`/me/push/${id}`);
  await SecureStore.deleteItemAsync(key);
}
export async function listenForNotifications(onOpen: (path: string) => void) {
  if (!nativePushAvailable) return () => {};
  const n = await import("expo-notifications");
  n.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  const open = (response: any) => {
    const path = response?.notification?.request?.content?.data?.path;
    if (
      typeof path === "string" &&
      path.startsWith("/") &&
      !path.startsWith("//")
    )
      onOpen(path);
  };
  const sub = n.addNotificationResponseReceivedListener(open);
  const previous = await n.getLastNotificationResponseAsync();
  if (previous) {
    open(previous);
    await n.clearLastNotificationResponseAsync();
  }
  return () => sub.remove();
}
