export function resolveApiUrl({
  explicit,
  hostUri,
  development,
  port = 4000,
}: {
  explicit?: string;
  hostUri?: string | null;
  development: boolean;
  port?: number;
}) {
  if (explicit?.trim()) {
    const url = new URL(explicit.trim());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error("The API address must be an HTTP(S) origin.");
    if (!development && url.protocol !== "https:")
      throw new Error("Release builds require an HTTPS API address.");
    return url.origin;
  }
  if (!development)
    throw new Error("Set EXPO_PUBLIC_API_URL before building a release.");
  const host = hostUri
    ? new URL(hostUri.includes("://") ? hostUri : `http://${hostUri}`).hostname
    : null;
  if (!host || /\.exp\.direct$|\.ngrok\./i.test(host))
    throw new Error(
      "Use npm run mobile to configure your phone connection, or set EXPO_PUBLIC_API_URL.",
    );
  return `http://${host}:${port}`;
}
