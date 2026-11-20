import Constants from "expo-constants";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { brand, notificationRoute, type ApiClient } from "@autocars/core";
const openedResponses = new Set<string>();
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
  let token: string;
  try {
    token = (await notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      Platform.OS === "android" &&
      /firebase|messaging service|fcm/i.test(message)
    )
      throw new Error(
        `Android push could not register with Firebase. Configure google-services.json for ${brand.androidPackage}, upload the matching FCM v1 credential in EAS, then rebuild and reinstall the Android app. Reloading JavaScript cannot add Firebase to an existing build.`,
      );
    throw error;
  }
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
    const id = response?.notification?.request?.identifier;
    if (!notificationRoute(path) || (id && openedResponses.has(id))) return;
    if (id) {
      openedResponses.add(id);
      if (openedResponses.size > 100)
        openedResponses.delete(openedResponses.values().next().value!);
    }
    onOpen(path);
  };
  const sub = n.addNotificationResponseReceivedListener(open);
  try {
    const previous = await n.getLastNotificationResponseAsync();
    if (previous) {
      open(previous);
      await n.clearLastNotificationResponseAsync();
    }
  } catch (error) {
    sub.remove();
    throw error;
  }
  return () => sub.remove();
}
