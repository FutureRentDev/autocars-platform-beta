import brand from "../../config/brand.json";
import expoProject from "../../config/expo.json";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
export default function appConfig({ projectRoot }: { projectRoot: string }) {
  const localGoogleServices = resolve(projectRoot, "google-services.json");
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ||
    (existsSync(localGoogleServices) ? localGoogleServices : undefined);
  if (
    process.env.EAS_BUILD === "true" &&
    process.env.EAS_BUILD_PLATFORM === "android"
  ) {
    if (!googleServicesFile)
      throw new Error(
        "Android push requires AutoCars' google-services.json. Set the GOOGLE_SERVICES_JSON EAS file variable for this build environment, then rebuild.",
      );
    const googleServices = JSON.parse(readFileSync(googleServicesFile, "utf8"));
    if (
      !googleServices.client?.some(
        (client: any) =>
          client.client_info?.android_client_info?.package_name ===
          brand.androidPackage,
      )
    )
      throw new Error(
        `google-services.json does not include the Android package ${brand.androidPackage}. Download the Firebase client configuration for this app, then rebuild.`,
      );
  }
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
  return {
    expo: {
      name: brand.name,
      slug: brand.slug,
      scheme: brand.scheme,
      version: "1.0.0",
      orientation: "portrait",
      userInterfaceStyle: "dark",
      owner: process.env.EXPO_OWNER || expoProject.owner,
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
          foregroundImage: "./assets/adaptive-icon.png",
          monochromeImage: "./assets/adaptive-icon.png",
          backgroundColor: brand.background,
        },
        permissions: ["POST_NOTIFICATIONS"],
        ...(googleServicesFile ? { googleServicesFile } : {}),
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
        eas: {
          projectId: process.env.EXPO_PROJECT_ID || expoProject.projectId,
        },
      },
    },
  };
}
