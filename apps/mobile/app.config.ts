import brand from "../../config/brand.json";
const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const profile = process.env.EAS_BUILD_PROFILE;
if (profile === "preview" || profile === "production") {
  if (!apiUrl)
    throw new Error(
      "Set EXPO_PUBLIC_API_URL in the EAS environment before building a standalone app.",
    );
  const url = new URL(apiUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    /^(localhost|127\.|0\.0\.0\.0)|\.(invalid|example)$/.test(url.hostname)
  )
    throw new Error(
      "Standalone builds require your real HTTPS API origin, without a path or credentials.",
    );
}
export default {
  expo: {
    name: brand.name,
    slug: brand.slug,
    scheme: brand.scheme,
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "dark",
    ...(process.env.EXPO_OWNER ? { owner: process.env.EXPO_OWNER } : {}),
    icon: "./assets/icon.png",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: brand.background,
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: brand.iosBundleIdentifier,
      infoPlist: {
        NSPhotoLibraryUsageDescription:
          "Choose photos for your vehicle listing.",
        NSLocalNetworkUsageDescription:
          "Connect to your AutoCars server on the same Wi-Fi while testing.",
      },
    },
    android: {
      package: brand.androidPackage,
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: brand.background,
      },
      permissions: ["POST_NOTIFICATIONS"],
      ...(process.env.GOOGLE_SERVICES_JSON
        ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
        : {}),
    },
    plugins: [
      "expo-secure-store",
      "expo-dev-client",
      [
        "expo-notifications",
        {
          defaultChannel: "marketplace",
          icon: "./assets/notification-icon.png",
          color: brand.primary,
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "Choose photos for your vehicle listing.",
          cameraPermission: false,
          microphonePermission: false,
        },
      ],
    ],
    extra: {
      apiUrl,
      ...(process.env.EXPO_PROJECT_ID
        ? { eas: { projectId: process.env.EXPO_PROJECT_ID } }
        : {}),
    },
  },
};
