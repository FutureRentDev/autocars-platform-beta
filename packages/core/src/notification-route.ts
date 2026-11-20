export type NotificationRoute =
  | { kind: "chat"; id: string }
  | { kind: "listing"; id: string }
  | { kind: "payment"; id: string }
  | { kind: "workspace"; tab: string }
  | { kind: "account" }
  | { kind: "home" };

export function notificationRoute(value: unknown): NotificationRoute | null {
  if (
    typeof value !== "string" ||
    value.length > 2000 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\x00-\x20]/.test(value)
  )
    return null;
  try {
    const url = new URL(value, "https://autocars.local");
    if (url.origin !== "https://autocars.local") return null;
    const match = url.pathname.match(/^\/(chat|cars)\/([^/]+)$/);
    if (match) {
      const id = decodeURIComponent(match[2]);
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
      return { kind: match[1] === "chat" ? "chat" : "listing", id };
    }
    if (url.pathname === "/payment") {
      const id = url.searchParams.get("id");
      return id && /^[A-Za-z0-9_-]{1,128}$/.test(id)
        ? { kind: "payment", id }
        : null;
    }
    if (url.pathname === "/workspace") {
      const tab = url.searchParams.get("tab") || "inventory";
      if (
        ![
          "overview",
          "inventory",
          "leads",
          "business",
          "businesses",
          "payments",
          "users",
          "audit",
        ].includes(tab)
      )
        return null;
      return { kind: "workspace", tab };
    }
    if (url.pathname === "/account") return { kind: "account" };
    if (url.pathname === "/") return { kind: "home" };
  } catch {}
  return null;
}
