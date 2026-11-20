import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ApiError,
  ApiClient,
  LiveClient,
  type LiveStatus,
  type User,
  type Listing,
} from "@autocars/core";
export const api = new ApiClient(import.meta.env.VITE_API_URL || "");
export type InboxSummary = {
  items: {
    id: string;
    title: string;
    preview: string;
    unread: number;
    updatedAt: string;
  }[];
  unread: number;
};
const Context = createContext<any>(null);
const accountTopics = [
  "account",
  "inventory",
  "enquiries",
  "garage",
  "businesses",
  "admin",
];
export function Provider({ children }: { children: ReactNode }) {
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("connecting");
  const [inbox, setInbox] = useState<{
    items: {
      id: string;
      title: string;
      preview: string;
      unread: number;
      updatedAt: string;
    }[];
    unread: number;
  }>({ items: [], unread: 0 });
  const refreshVersion = useRef(0);
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [toast, setToast] = useState(""),
    [saved, setSaved] = useState<Listing[]>([]),
    [compare, setCompare] = useState<Listing[]>(() => {
      try {
        return JSON.parse(sessionStorage.getItem("compare") || "[]");
      } catch {
        return [];
      }
    });
  function notify(s: string) {
    setToast(s);
  }
  async function refresh() {
    const version = ++refreshVersion.current;
    try {
      const r = await api.get("/auth/me");
      const [favourites, messages] = await Promise.all([
        api.get("/me/favourites"),
        api.get("/me/inbox"),
      ]);
      if (version !== refreshVersion.current) return;
      setUser(r.user);
      setSaved(favourites.items);
      setInbox(messages);
    } catch (e) {
      if (version !== refreshVersion.current) return;
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setSaved([]);
        setInbox({ items: [], unread: 0 });
      } else notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  const listeners = useRef(new Set<(topics: string[]) => void>());
  function subscribeLive(fn: (topics: string[]) => void) {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }
  useEffect(() => {
    refresh();
  }, []);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const compareRef = useRef(compare);
  compareRef.current = compare;
  useEffect(() => {
    const client = new LiveClient(
      api.base || window.location.origin,
      () => api.token,
      (topics) => {
        for (const listener of listeners.current) listener(topics);
        window.dispatchEvent(
          new CustomEvent("autocars:live", { detail: topics }),
        );
        if (
          topics.some((t) =>
            ["all", "account", "garage", "catalogue"].includes(t),
          )
        )
          void refreshRef.current();
        if (topics.includes("catalogue") || topics.includes("all"))
          void Promise.all(
            compareRef.current.map(async (c) => {
              try {
                const r = await api.get(`/listings/${c.id}`);
                return r.listing.status === "published" ? r.listing : null;
              } catch (e) {
                return e instanceof ApiError && e.status === 404 ? null : c;
              }
            }),
          ).then((items) => setCompare(items.filter((c): c is Listing => !!c)));
      },
      setLiveStatus,
    );
    client.start();
    const resume = () => {
      if (document.visibilityState === "visible") client.reconnect();
    };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      client.stop();
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [user?.id]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    sessionStorage.setItem("compare", JSON.stringify(compare));
  }, [compare]);
  async function favourite(l: Listing) {
    if (!user) {
      notify("Sign in to save cars to your garage.");
      return;
    }
    try {
      if (saved.some((x) => x.id === l.id)) {
        await api.delete(`/me/favourites/${l.id}`);
        setSaved((prev) => prev.filter((x) => x.id !== l.id));
      } else {
        await api.post(`/me/favourites/${l.id}`);
        setSaved((prev) =>
          prev.some((x) => x.id === l.id) ? prev : [...prev, l],
        );
      }
    } catch (e) {
      notify((e as Error).message);
    }
  }
  function toggleCompare(l: Listing) {
    if (compare.some((x) => x.id === l.id))
      setCompare(compare.filter((x) => x.id !== l.id));
    else if (compare.length < 3) setCompare([...compare, l]);
    else notify("Compare up to three cars at a time.");
  }
  return (
    <Context.Provider
      value={{
        user,
        inbox,
        liveStatus,
        loading,
        refresh,
        notify,
        saved,
        favourite,
        compare,
        toggleCompare,
        subscribeLive,
      }}
    >
      {children}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export function useApp() {
  return useContext(Context) as {
    user: User | null;
    inbox: InboxSummary;
    liveStatus: LiveStatus;
    loading: boolean;
    refresh: () => Promise<void>;
    notify: (s: string) => void;
    saved: Listing[];
    favourite: (l: Listing) => void;
    compare: Listing[];
    toggleCompare: (l: Listing) => void;
    subscribeLive: (fn: (topics: string[]) => void) => () => void;
  };
}
export function useLiveUpdate(
  callback: (topics: string[]) => void,
  topics?: string[],
) {
  const ref = useRef(callback);
  ref.current = callback;
  const topicsRef = useRef(topics);
  topicsRef.current = topics;
  useEffect(() => {
    const listener = (event: Event) => {
      const changed = (event as CustomEvent<string[]>).detail;
      if (
        !topicsRef.current ||
        changed.some((t) => topicsRef.current!.includes(t) || t === "all")
      )
        ref.current(changed);
    };
    window.addEventListener("autocars:live", listener);
    return () => window.removeEventListener("autocars:live", listener);
  }, []);
}
export function useLoad<T>(path: string, initial: T, topics?: string[]) {
  const [data, setData] = useState<T>(initial),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const generation = useRef(0);
  async function load(silent = false) {
    const version = ++generation.current;
    if (!silent) setLoading(true);
    try {
      const next = await api.get<T>(path);
      if (version === generation.current) {
        setData(next);
        setError("");
      }
    } catch (e) {
      if (version === generation.current) setError((e as Error).message);
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [path]);
  useLiveUpdate(() => {
    void load(true);
  }, topics);
  return { data, error, loading, reload: () => load(), setData };
}
