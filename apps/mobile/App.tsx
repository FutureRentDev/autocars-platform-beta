import {
  enableNativePush,
  disableNativePush,
  listenForNotifications,
  nativePushAvailable,
} from "./src/push";
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  AppState,
  Alert,
  Image,
  ImageBackground,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Keyboard,
  Share,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { resolveApiUrl } from "./src/api-url";
import * as SecureStore from "expo-secure-store";
import * as ImagePicker from "expo-image-picker";
import * as ExpoLinking from "expo-linking";

import {
  ApiClient,
  type LiveStatus,
  ApiError,
  LiveClient,
  notificationRoute,
  brand,
  bodyTypes,
  canSell,
  requiresAdFee,
  fuels,
  provinces,
  money,
  payment,
  type Listing,
  type User,
  type Filters,
  type SavedSearch,
  type Lead,
  type Enquiry,
  type ChatMessage,
  type ChatThread,
  type BusinessApplication,
  type BusinessStatus,
} from "@autocars/core";
const base = resolveApiUrl({
  explicit: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
  development: __DEV__,
});
const api = new ApiClient(base, 20000, "mobile");

const tokenKey = `${brand.slug}.session`;
const emptyBiz = {
  businessName: "",
  registrationNumber: "",
  contactName: "",
  phone: "",
  province: "Gauteng",
  city: "",
  website: "",
  message: "",
};
const bizStatusText: Record<BusinessStatus, string> = {
  pending: "Application under review",
  contacted: "AutoCars has been in touch",
  active: "Selling activated",
  rejected: "Application not approved",
  suspended: "Selling suspended",
};
const liveTopics = [
  "account",
  "inventory",
  "enquiries",
  "garage",
  "businesses",
];
type Tab = "Explore" | "Saved" | "Sell" | "Inbox" | "Account";
const fresh = {
  make: "",
  model: "",
  variant: "",
  year: String(new Date().getFullYear()),
  price: "",
  mileage: "",
  bodyType: "SUV",
  fuel: "Petrol",
  transmission: "Automatic",
  province: "Gauteng",
  city: "",
  description: "",
  sellerName: "",
  phone: "",
  images: [] as string[],
  greatValue: false,
};
const adExpired = (l: Listing) =>
  !!l.paidUntil && new Date(l.paidUntil).getTime() <= Date.now();
function Button({
  children,
  onPress,
  outline = false,
  disabled = false,
}: {
  children: ReactNode;
  onPress: () => void;
  outline?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        outline && s.outline,
        (pressed || disabled) && { opacity: 0.5 },
      ]}
    >
      <Text style={[s.buttonText, outline && { color: brand.primary }]}>
        {children}
      </Text>
    </Pressable>
  );
}
function Field({
  label,
  value,
  onChange,
  placeholder = "",
  numeric = false,
  secure = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
  secure?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[
          s.input,
          multiline && { minHeight: 120, textAlignVertical: "top" },
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#8d8d88"
        keyboardType={
          numeric
            ? "decimal-pad"
            : label.toLowerCase().includes("email")
              ? "email-address"
              : "default"
        }
        secureTextEntry={secure}
        autoCapitalize={
          secure || label.toLowerCase().includes("email") ? "none" : "sentences"
        }
        multiline={multiline}
      />
    </View>
  );
}
function Select({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={s.field}
      >
        <Text style={s.label}>{label}</Text>
        <View style={[s.input, s.row]}>
          <Text style={s.flex}>{value || `Any ${label.toLowerCase()}`}</Text>
          <Text style={{ color: "#8d8d88" }}>⌄</Text>
        </View>
      </Pressable>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={s.screen}>
          <View style={[s.row, s.modalHeader]}>
            <Text style={s.subtitle}>{label}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(false)}
            >
              <Text style={s.link}>Done</Text>
            </Pressable>
          </View>
          <ScrollView>
            {values.map((v) => (
              <Pressable
                accessibilityRole="button"
                key={v}
                style={s.option}
                onPress={() => {
                  onChange(v);
                  setOpen(false);
                }}
              >
                <Text style={{ fontSize: 16, color: "#f2f2f0" }}>
                  {v || "Any"}
                </Text>
                <Text style={{ color: "#9b9b96" }}>
                  {v === value ? "✓" : ""}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyIcon}>↗</Text>
      <Text style={s.subtitle}>{title}</Text>
      <Text style={s.muted}>{children}</Text>
    </View>
  );
}
function CheckBox({
  value,
  onChange,
  children,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[s.row, { alignItems: "flex-start", gap: 12, marginVertical: 14 }]}
    >
      <View style={[s.check, value && { backgroundColor: brand.primary }]}>
        <Text style={{ color: "#111" }}>{value ? "✓" : ""}</Text>
      </View>
      <Text style={[s.small, s.flex]}>{children}</Text>
    </Pressable>
  );
}
function CarCard({
  car,
  isSaved,
  isCompared,
  openCar,
  favourite,
  toggleCompare,
}: {
  car: Listing;
  isSaved: boolean;
  isCompared: boolean;
  openCar: (car: Listing) => void;
  favourite: (car: Listing) => void;
  toggleCompare: (car: Listing) => void;
}) {
  return (
    <View style={s.card}>
      <Pressable accessibilityRole="button" onPress={() => openCar(car)}>
        <Image source={{ uri: api.image(car.images[0]) }} style={s.cardImage} />
        {car.featured && <Text style={s.featured}>FEATURED</Text>}
        {car.greatValue && (
          <Text style={[s.featured, car.featured && { top: 33 }]}>
            GREAT VALUE
          </Text>
        )}
      </Pressable>
      <Pressable
        accessibilityLabel="Save car"
        style={s.heart}
        onPress={() => favourite(car)}
      >
        <Text
          style={{
            fontSize: 22,
            color: isSaved ? "#e03131" : "#111",
          }}
        >
          {isSaved ? "♥" : "♡"}
        </Text>
      </Pressable>
      <View style={s.cardContent}>
        <Text style={s.eyebrow}>
          {car.year} · {car.bodyType.toUpperCase()}
        </Text>
        <Pressable onPress={() => openCar(car)}>
          <Text style={s.subtitle}>
            {car.make} {car.model}
          </Text>
          <Text style={s.small}>{car.variant}</Text>
        </Pressable>
        <Text style={s.price}>{money(car.price)}</Text>
        <Text style={s.small}>Est. {money(payment(car.price))}/month*</Text>
        <Text style={[s.small, { marginVertical: 16 }]}>
          {car.mileage.toLocaleString()} km · {car.transmission} · {car.fuel}
        </Text>
        <View style={s.cardBottom}>
          <Text style={s.small}>⌖ {car.city}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => toggleCompare(car)}
          >
            <Text style={s.link}>⇄ {isCompared ? "Added" : "Compare"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AutoCars />
    </SafeAreaProvider>
  );
}
function AutoCars() {
  const [tab, setTab] = useState<Tab>("Explore"),
    [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [items, setItems] = useState<Listing[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [pages, setPages] = useState(0),
    [filters, setFilters] = useState<Filters>({}),
    [query, setQuery] = useState(""),
    [filterOpen, setFilterOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [detail, setDetail] = useState<Listing | null>(null),
    [photo, setPhoto] = useState(0),
    [saved, setSaved] = useState<Listing[]>([]),
    [searches, setSearches] = useState<SavedSearch[]>([]),
    [mine, setMine] = useState<Listing[]>([]),
    [leads, setLeads] = useState<Lead[]>([]),
    [compare, setCompare] = useState<Listing[]>([]),
    [compareOpen, setCompareOpen] = useState(false),
    [financeOpen, setFinanceOpen] = useState(false),
    [authMode, setAuthMode] = useState<
      "login" | "register" | "forgot" | "reset"
    >("login"),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [consent, setConsent] = useState(false),
    [legalOpen, setLegalOpen] = useState(false),
    [resetToken, setResetToken] = useState(""),
    [price, setPrice] = useState("350000"),
    [deposit, setDeposit] = useState("35000"),
    [rate, setRate] = useState("11.75"),
    [term, setTerm] = useState("72"),
    [balloon, setBalloon] = useState("0"),
    [form, setForm] = useState({ ...fresh }),
    [editId, setEditId] = useState<string | null>(null),
    [step, setStep] = useState(0),
    [uploading, setUploading] = useState(false),
    [enquireOpen, setEnquireOpen] = useState(false),
    [phone, setPhone] = useState(""),
    [message, setMessage] = useState(""),
    [enquiryConsent, setEnquiryConsent] = useState(false),
    [showMine, setShowMine] = useState(false),
    [deleteOpen, setDeleteOpen] = useState(false),
    [liveStatus, setLiveStatus] = useState<LiveStatus>("connecting"),
    [accountType, setAccountType] = useState<"customer" | "business">(
      "customer",
    ),
    [biz, setBiz] = useState({ ...emptyBiz }),
    [bizConsent, setBizConsent] = useState(false),
    [bizApp, setBizApp] = useState<BusinessApplication | null>(null),
    [bizFormOpen, setBizFormOpen] = useState(false),
    [payCard, setPayCard] = useState(""),
    [payMsg, setPayMsg] = useState(""),
    [renewTarget, setRenewTarget] = useState<Listing | null>(null),
    [renewCard, setRenewCard] = useState(""),
    [renewMsg, setRenewMsg] = useState(""),
    [enquiries, setEnquiries] = useState<Enquiry[]>([]),
    [chat, setChat] = useState<{
      id: string;
      title: string;
      listingId: string;
    } | null>(null),
    [chatTruncated, setChatTruncated] = useState(false),
    [chatMsgs, setChatMsgs] = useState<ChatMessage[]>([]),
    [chatDraft, setChatDraft] = useState(""),
    [toast, setToast] = useState<{ title: string; message: string } | null>(
      null,
    );
  const stateRef = useRef({ filters, page }),
    detailRef = useRef<Listing | null>(null),
    liveRef = useRef<LiveClient | null>(null);
  stateRef.current = { filters, page };
  detailRef.current = detail;
  const notify = (
    title: string,
    message: string,
    buttons?: Parameters<typeof Alert.alert>[2],
  ) => {
    if (buttons?.length) Alert.alert(title, message, buttons);
    else setToast({ title, message });
  };
  const [pushBusy, setPushBusy] = useState(false),
    [notices, setNotices] = useState<any[]>([]),
    [notificationPath, setNotificationPath] = useState<string | null>(null);
  const contentScroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const chatScroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const followChat = useRef(true);
  const forceChatLatest = useRef(true);
  const scrollChatToLatest = (animated = false) => {
    if (followChat.current || forceChatLatest.current)
      chatScroll.current?.scrollToEnd({ animated });
  };
  useEffect(() => {
    followChat.current = true;
    forceChatLatest.current = true;
  }, [chat?.id]);
  const accountScroll = useRef(false);
  const businessPosition = useRef(0);
  const notificationNavigation = useRef(0);
  const chatListing = useRef<{ listing: Listing; navigation: number } | null>(
    null,
  );
  function closeChat() {
    ++notificationNavigation.current;
    chatListing.current = null;
    Keyboard.dismiss();
    setChat(null);
  }
  useEffect(() => {
    let cleanup = () => {};
    let disposed = false;
    void listenForNotifications(setNotificationPath)
      .then((fn) => {
        if (disposed) fn();
        else cleanup = fn;
      })
      .catch((e) => {
        if (!disposed) setError((e as Error).message);
      });
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);
  useEffect(() => {
    if (!ready || !notificationPath) return;
    const target = notificationRoute(notificationPath);
    if (!target) {
      setNotificationPath(null);
      return;
    }
    if (target.kind !== "home" && !user) {
      setTab("Account");
      return; // Resume this destination after session restoration/sign-in.
    }
    setNotificationPath(null);
    const navigation = ++notificationNavigation.current;
    setDetail(null);
    setChat(null);
    setFilterOpen(false);
    setFinanceOpen(false);
    setCompareOpen(false);
    setLegalOpen(false);
    setDeleteOpen(false);
    setRenewTarget(null);
    void (async () => {
      if (target.kind === "home") return goHome();
      if (target.kind === "chat") {
        setTab("Inbox");
        setChatMsgs([]);
        setChatDraft("");
        const r = await api.get<ChatThread>(`/leads/${target.id}/messages`);
        if (notificationNavigation.current !== navigation) return;
        setChatMsgs(r.items);
        setChatTruncated(r.truncated);
        setChat({
          id: target.id,
          title: r.vehicle.title,
          listingId: r.vehicle.id,
        });
        void refreshAccount();
      } else if (target.kind === "listing") {
        const r = await api.get(`/listings/${target.id}`);
        if (notificationNavigation.current === navigation) openCar(r.listing);
      } else if (target.kind === "payment") {
        setTab("Account");
        setShowMine(true);
        const { payment } = await api.get(`/payments/${target.id}`);
        if (notificationNavigation.current !== navigation) return;
        if (payment.listingId) {
          const r = await api.get(`/listings/${payment.listingId}`);
          if (notificationNavigation.current === navigation) openCar(r.listing);
        } else
          notify(
            "Advertisement payment",
            payment.error || `Payment status: ${payment.status}`,
          );
      } else {
        if (
          target.kind === "workspace" &&
          ["businesses", "payments", "users", "audit"].includes(target.tab)
        ) {
          // These staff tools are provided by the web administration workspace.
          const web = new URL(base);
          if (__DEV__ && web.port === "4000") web.port = "5173";
          await Linking.openURL(
            `${web.origin}/workspace?tab=${encodeURIComponent(target.tab)}`,
          );
          return;
        }
        setTab(
          target.kind === "workspace" && target.tab === "leads"
            ? "Inbox"
            : "Account",
        );
        setShowMine(
          target.kind === "workspace" &&
            ["inventory", "overview"].includes(target.tab),
        );
        if (target.kind === "workspace" && target.tab === "business") {
          accountScroll.current = true;
          requestAnimationFrame(() => {
            if (businessPosition.current > 0)
              contentScroll.current?.scrollTo({
                y: businessPosition.current,
                animated: true,
              });
          });
        } else contentScroll.current?.scrollTo({ y: 0, animated: false });
      }
    })().catch((e) => {
      if (notificationNavigation.current === navigation) report(e);
    });
  }, [ready, user?.id, notificationPath]);
  function goHome() {
    ++notificationNavigation.current;
    setNotificationPath(null);
    chatListing.current = null;
    accountScroll.current = false;
    setChat(null);
    setDetail(null);
    setTab("Explore");
    setFilterOpen(false);
    setFinanceOpen(false);
    setCompareOpen(false);
    setQuery("");
    setFilters({});
    contentScroll.current?.scrollTo({ y: 0, animated: true });
    void load({}, 1);
  }
  const report = (e: unknown) => {
    const m = (e as Error).message || "Please try again.";
    setError(m);
    notify(brand.name, m);
  };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);
  const unreadTotal =
    leads.reduce((n, l) => n + (l.unread || 0), 0) +
    enquiries.reduce((n, e) => n + (e.unread || 0), 0);
  const financeNumber = (value: string) => {
      const n = Number(value);
      return value.trim() !== "" && Number.isFinite(n) ? Math.max(0, n) : null;
    },
    [fp, fd, fr, ft, fb] = [price, deposit, rate, term, balloon].map(
      financeNumber,
    ),
    monthlyPayment =
      fp !== null && fd !== null && fr !== null && ft !== null && fb !== null
        ? payment(fp, fd, fr, ft, fb)
        : null,
    balloonPayment = fp !== null && fb !== null ? (fp * fb) / 100 : null;
  async function openChat(id: string, title: string) {
    const navigation = ++notificationNavigation.current;
    setChat(null);
    setChatMsgs([]);
    setChatDraft("");
    try {
      const r = await api.get<ChatThread>(`/leads/${id}/messages`);
      if (notificationNavigation.current !== navigation) return;
      setChatMsgs(r.items);
      setChatTruncated(r.truncated);
      setChat({ id, title: r.vehicle.title, listingId: r.vehicle.id });
      await refreshAccount();
    } catch (e) {
      report(e);
    }
  }
  async function sendChat() {
    const body = chatDraft.trim();
    if (!chat || !body || busy) return;
    setBusy(true);
    try {
      await api.post(`/leads/${chat.id}/messages`, { body });
      followChat.current = true;
      forceChatLatest.current = true;
      setChatDraft("");
      const r = await api.get<ChatThread>(`/leads/${chat.id}/messages`);
      setChatMsgs(r.items);
      setChatTruncated(r.truncated);
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!chat) return;
    let active = true;
    const t = setInterval(async () => {
      try {
        const r = await api.get<ChatThread>(`/leads/${chat.id}/messages`);
        if (active) {
          setChatMsgs(r.items);
          setChatTruncated(r.truncated);
          setChat((current) =>
            current?.id === chat.id
              ? { ...current, title: r.vehicle.title, listingId: r.vehicle.id }
              : current,
          );
        }
      } catch {}
    }, 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [chat?.id]);
  function clearAccount() {
    setUser(null);
    setSaved([]);
    setSearches([]);
    setMine([]);
    setLeads([]);
  }
  async function refreshAccount() {
    if (!api.token) {
      clearAccount();
      return;
    }
    try {
      const r = await api.get("/auth/me");
      setUser(r.user);
      if (!enquireOpen) {
        setName(r.user.name);
        setEmail(r.user.email);
      }

      setForm((p) => ({ ...p, sellerName: p.sellerName || r.user.name }));
      const [f, ss, ml, el, en] = await Promise.all([
        api.get("/me/favourites"),
        api.get("/me/searches"),
        api.get("/me/listings"),
        api.get("/me/leads"),
        api.get("/me/enquiries"),
      ]);
      setSaved(f.items);
      setSearches(ss.items);
      setMine(ml.items);
      setLeads(el.items);
      setEnquiries(en.items);
      setNotices((await api.get("/me/notifications")).items);
      if (r.user.accountType === "business") {
        const b = await api.get("/me/business");
        setBizApp(b.application);
        if (b.application && !bizFormOpen)
          setBiz({
            businessName: b.application.businessName,
            registrationNumber: b.application.registrationNumber,
            contactName: b.application.contactName,
            phone: b.application.phone,
            province: b.application.province,
            city: b.application.city,
            website: b.application.website,
            message: b.application.message,
          });
      } else setBizApp(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        api.token = null;
        clearAccount();
        await SecureStore.deleteItemAsync(tokenKey).catch(() => {});
      } else setError((e as Error).message);
    }
  }
  async function load(f = filters, p = 1, silent = false) {
    if (!silent) setBusy(true);
    setError("");
    try {
      const q = new URLSearchParams({ ...f, page: String(p) } as Record<
        string,
        string
      >);
      const r = await api.get(`/listings?${q}`);
      setItems(r.items);
      setTotal(r.total);
      setPage(r.page);
      setPages(r.pages);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (!silent) setBusy(false);
    }
  }
  async function deepLink(url: string) {
    const parsed = ExpoLinking.parse(url);
    const q = parsed.queryParams || {};
    if (typeof q.verify === "string")
      try {
        await api.post("/auth/verify", { token: q.verify });
        await refreshAccount();
        notify("Email verified", "You’re ready to list your car.");
      } catch (e) {
        report(e);
      }
    if (typeof q.reset === "string") {
      setResetToken(q.reset);
      setAuthMode("reset");
      setTab("Account");
      setPassword("");
    }
    if (parsed.path?.startsWith("cars/"))
      try {
        const r = await api.get(`/listings/${parsed.path.split("/")[1]}`);
        openCar(r.listing);
      } catch (e) {
        report(e);
      }
  }
  useEffect(() => {
    (async () => {
      try {
        api.token = await SecureStore.getItemAsync(tokenKey);
        await Promise.all([refreshAccount(), load()]);
        const url = await Linking.getInitialURL();
        if (url) await deepLink(url);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setReady(true);
      }
    })();
    const sub = Linking.addEventListener("url", (e) => deepLink(e.url));
    return () => {
      sub.remove();
      liveRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const liveRefresh = useRef(async (_topics: string[]) => {});
  liveRefresh.current = async (topics) => {
    if (topics.includes("all") || topics.includes("catalogue")) {
      void load(filters, page, true);
      if (detail)
        try {
          const r = await api.get(`/listings/${detail.id}`);
          setDetail(r.listing);
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) {
            setDetail(null);
            Alert.alert(
              "Listing unavailable",
              "This vehicle is no longer publicly available.",
            );
          }
        }
      void Promise.all(
        compare.map(async (c) => {
          try {
            const r = await api.get(`/listings/${c.id}`);
            return r.listing.status === "published" ? r.listing : null;
          } catch (e) {
            return e instanceof ApiError && e.status === 404 ? null : c;
          }
        }),
      ).then((cars) => setCompare(cars.filter((c): c is Listing => !!c)));
    }
    if (
      topics.some((t) =>
        [
          "all",
          "account",
          "inventory",
          "garage",
          "enquiries",
          "businesses",
          "notifications",
          "catalogue",
        ].includes(t),
      )
    )
      await refreshAccount();
  };
  useEffect(() => {
    if (!ready) return;
    const client = new LiveClient(
      base,
      () => api.token,
      (topics) => {
        void liveRefresh.current(topics);
      },
      setLiveStatus,
    );
    client.start();
    liveRef.current = client;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") client.reconnect();
      else client.stop();
    });
    return () => {
      sub.remove();
      client.stop();
    };
  }, [ready, user?.id]);
  async function signIn() {
    setBusy(true);
    setError("");
    try {
      if (authMode === "forgot") {
        await api.post("/auth/forgot", { email });
        notify(
          "Check your inbox",
          "If the account exists, a recovery link has been sent.",
        );
        return;
      }
      if (authMode === "reset") {
        await api.post("/auth/reset", { token: resetToken, password });
        setAuthMode("login");
        setResetToken("");
        setPassword("");
        notify("Password changed", "Sign in with your new password.");
        return;
      }
      if (authMode === "register" && !consent)
        throw new Error(
          "Please accept the privacy notice and marketplace terms.",
        );
      if (
        authMode === "register" &&
        accountType === "business" &&
        (!bizConsent || !biz.businessName.trim())
      )
        throw new Error(
          "Add your business name and confirm we may contact you about the application.",
        );
      const r = await api.request(`/auth/${authMode}`, {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          password,
          consent,
          ...(authMode === "register"
            ? {
                accountType,
                ...(accountType === "business"
                  ? { business: { ...biz, contactConsent: bizConsent } }
                  : {}),
              }
            : {}),
        }),
      });
      api.token = r.token;
      await SecureStore.setItemAsync(tokenKey, r.token);
      setPassword("");
      await refreshAccount();
      liveRef.current?.reconnect();
      if (!notificationPath) setTab("Saved");
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await disableNativePush(api);
      await api.post("/auth/logout");
    } catch (e) {
      report(e);
      return;
    }
    api.token = null;
    await SecureStore.deleteItemAsync(tokenKey);
    liveRef.current?.reconnect();
    setUser(null);
    setSaved([]);
    setSearches([]);
    setMine([]);
    setLeads([]);
    setBizApp(null);
    setPassword("");
    setTab("Account");
  }
  async function favourite(l: Listing) {
    if (!user) {
      setTab("Account");
      setDetail(null);
      notify("Keep the good ones close", "Sign in to save cars.");
      return;
    }
    try {
      if (saved.some((c) => c.id === l.id)) {
        await api.delete(`/me/favourites/${l.id}`);
        setSaved((prev) => prev.filter((c) => c.id !== l.id));
      } else {
        await api.post(`/me/favourites/${l.id}`);
        setSaved((prev) =>
          prev.some((c) => c.id === l.id) ? prev : [...prev, l],
        );
      }
    } catch (e) {
      report(e);
    }
  }
  function toggleCompare(l: Listing) {
    if (compare.some((c) => c.id === l.id))
      setCompare(compare.filter((c) => c.id !== l.id));
    else if (compare.length < 3) setCompare([...compare, l]);
    else
      notify(
        "Three’s a good number",
        "Remove a car before adding another to compare.",
      );
  }
  function openCar(l: Listing) {
    setDetail(l);
    setPhoto(0);
    setEnquireOpen(false);
    setMessage(
      `Hi, I'm interested in your ${l.year} ${l.make} ${l.model}. Is it still available?`,
    );
    setEnquiryConsent(false);
  }
  function update(k: string, v: any) {
    setForm((p) => ({ ...p, [k]: v }));
  }
  function updateBiz(k: string, v: string) {
    setBiz((p) => ({ ...p, [k]: v }));
  }
  async function submitBusiness() {
    setBusy(true);
    try {
      await api.post("/me/business", { ...biz, contactConsent: bizConsent });
      setBizConsent(false);
      setBizFormOpen(false);
      await refreshAccount();
      notify(
        "Application submitted",
        "Our team will review your business details and be in touch.",
      );
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  async function choosePhotos() {
    setUploading(true);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          "Photo access is needed to select listing photos. You can allow it in Settings.",
        );
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 12 - form.images.length,
        quality: 0.85,
      });
      if (result.canceled) return;
      const urls: string[] = [];
      for (const asset of result.assets) {
        try {
          const fd = new FormData();
          fd.append("file", {
            uri: asset.uri,
            name: asset.fileName || "car.jpg",
            type: asset.mimeType || "image/jpeg",
          } as any);
          const r = await api.uploadForm<{ url: string }>("/uploads", fd);
          urls.push(r.url);
        } finally {
          if (urls.length) {
            const completed = [...urls];
            setForm((p) => ({ ...p, images: [...p.images, ...completed] }));
            urls.length = 0;
          }
        }
      }
    } catch (e) {
      report(e);
    } finally {
      setUploading(false);
    }
  }
  function nextStep() {
    if (step === 0) {
      const year = Number(form.year),
        price = Number(form.price),
        mileage = Number(form.mileage);
      if (
        !form.make.trim() ||
        !form.model.trim() ||
        !form.mileage.trim() ||
        ![year, price, mileage].every(Number.isFinite) ||
        year < 1900 ||
        year > new Date().getFullYear() + 1 ||
        price < 1000 ||
        mileage < 0
      ) {
        notify(
          "A few details are missing",
          "Add a make, model, valid year, price of at least R 1,000, and mileage.",
        );
        return;
      }
    }
    if (
      step === 1 &&
      (form.images.length === 0 || form.description.trim().length < 30)
    ) {
      notify(
        "Tell the full story",
        "Add a photo and a description of at least 30 characters.",
      );
      return;
    }
    setStep(step + 1);
  }
  const needsAdFee = requiresAdFee(user) && !editId,
    lastStep = needsAdFee ? 3 : 2;
  async function submitListing() {
    setBusy(true);
    setPayMsg("");
    try {
      if (!consent)
        throw new Error(
          "Please confirm that you have the right to advertise this vehicle.",
        );
      let paymentRef: string | undefined;
      if (needsAdFee)
        throw new Error(
          "Paid private advertisements require native store billing, which must be configured before this build can accept purchases.",
        );
      const b = {
        ...form,
        year: Number(form.year),
        price: Number(form.price),
        mileage: Number(form.mileage),
        ...(paymentRef ? { paymentRef } : {}),
      };
      if (editId) await api.patch(`/listings/${editId}`, b);
      else await api.post("/listings", b);
      setForm({ ...fresh, sellerName: user?.name || "" });
      setStep(0);
      setEditId(null);
      setConsent(false);
      await refreshAccount();
      notify(
        "A new chapter is on its way",
        "Your listing has been submitted for review.",
      );
      setTab("Account");
      setShowMine(true);
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  async function renewAd() {
    notify(
      "Purchases unavailable",
      "Native advertisement purchases must be configured with store billing before release.",
    );
  }
  async function sendEnquiry() {
    setBusy(true);
    try {
      await api.post(`/listings/${detail?.id}/enquire`, {
        name,
        email,
        phone,
        message,
        consent: enquiryConsent,
      });
      setEnquireOpen(false);
      notify(
        "You made the first move",
        "Your enquiry is in the seller’s workspace. They can contact you using the details you shared.",
      );
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  const requireSignIn = (
    <Empty title="A little closer to your next car.">
      Sign in from the Account tab to save cars, list a vehicle, and manage
      enquiries.
    </Empty>
  );
  const modalHeader = (title: string, close: () => void) => (
    <View style={[s.row, s.modalHeader]}>
      <Text style={s.subtitle}>{title}</Text>
      <Pressable accessibilityLabel="Close" onPress={close}>
        <Text style={s.close}>×</Text>
      </Pressable>
    </View>
  );
  if (!ready)
    return (
      <SafeAreaView
        style={[s.screen, { justifyContent: "center", alignItems: "center" }]}
      >
        <ActivityIndicator color={brand.primary} />
        <Text style={[s.small, { marginTop: 20 }]}>
          Your next chapter is loading…
        </Text>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={s.screen} edges={["top", "left", "right"]}>
      <StatusBar style="light" />
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${brand.name} home`}
          onPress={goHome}
        >
          <Image source={require("./assets/logo.png")} style={s.logo} />
        </Pressable>
        <Pressable onPress={() => setFinanceOpen(true)}>
          <Text style={s.link}>Know your budget ↗</Text>
          <Text
            style={{
              fontSize: 8,
              color: "#888",
              marginTop: 4,
              textAlign: "right",
            }}
          >
            {liveStatus === "live" ? "● Live" : "○ Reconnecting"}
          </Text>
        </Pressable>
      </View>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={contentScroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={busy && !uploading}
              onRefresh={() => {
                load();
                if (user) refreshAccount();
              }}
            />
          }
          contentContainerStyle={{ paddingBottom: 25 }}
        >
          {tab === "Explore" && (
            <>
              <ImageBackground
                source={require("./assets/hero.jpg")}
                style={s.hero}
              >
                <View style={s.heroShade}>
                  <Text style={s.lightEyebrow}>THE ROAD IS YOURS</Text>
                  <Text style={s.heroTitle}>
                    Your next car.{"\n"}Your next{" "}
                    <Text style={s.heroItalic}>chapter.</Text>
                  </Text>
                  <Text style={s.heroSubtitle}>
                    Discover a car that moves you.
                  </Text>
                </View>
              </ImageBackground>
              <View style={s.content}>
                <View style={s.searchBox}>
                  <Text style={s.eyebrow}>FIND YOUR NEXT CHAPTER</Text>
                  <View style={s.row}>
                    <TextInput
                      accessibilityLabel="Search cars"
                      style={[s.input, s.flex]}
                      placeholder="Make, model, or city"
                      placeholderTextColor="#8d8d88"
                      value={query}
                      onChangeText={setQuery}
                      returnKeyType="search"
                      onSubmitEditing={() => {
                        const f = { ...filters, q: query };
                        setFilters(f);
                        load(f);
                      }}
                    />
                    <Pressable
                      accessibilityLabel="Search"
                      style={s.searchButton}
                      onPress={() => {
                        const f = { ...filters, q: query };
                        setFilters(f);
                        load(f);
                      }}
                    >
                      <Text style={{ color: "#111", fontSize: 23 }}>↗</Text>
                    </Pressable>
                  </View>
                  <Pressable onPress={() => setFilterOpen(true)}>
                    <Text style={[s.link, { marginTop: 17 }]}>
                      ☷ Refine your search{" "}
                      {Object.values(filters).filter(Boolean).length > 0
                        ? "· Filters active"
                        : ""}
                    </Text>
                  </Pressable>
                </View>
                <Text style={s.eyebrow}>FIND YOUR KIND OF DRIVE</Text>
                <Text style={s.title}>
                  A car for every{"\n"}version of you.
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 28 }}
                >
                  {bodyTypes.slice(0, 6).map((b) => (
                    <Pressable
                      key={b}
                      style={[
                        s.category,
                        filters.bodyType === b && {
                          backgroundColor: brand.primary,
                        },
                      ]}
                      onPress={() => {
                        const f = { bodyType: b };
                        setFilters(f);
                        setQuery("");
                        load(f);
                      }}
                    >
                      <Text
                        style={[
                          s.categoryText,
                          filters.bodyType === b && { color: "#111" },
                        ]}
                      >
                        {b} ↗
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={[s.row, { marginBottom: 20 }]}>
                  <Text style={[s.subtitle, s.flex]}>
                    {total} cars to explore.
                  </Text>
                  {user && (
                    <Pressable
                      onPress={async () => {
                        try {
                          await api.post("/me/searches", {
                            name: query || filters.bodyType || "My car search",
                            filters,
                          });
                          await refreshAccount();
                          notify(
                            "Search saved",
                            "Find it again in your garage.",
                          );
                        } catch (e) {
                          report(e);
                        }
                      }}
                    >
                      <Text style={s.link}>Save search +</Text>
                    </Pressable>
                  )}
                </View>
                {error ? (
                  <View style={s.error}>
                    <Text style={{ color: "#f08a80" }}>{error}</Text>
                    <Button onPress={() => load()}>Try again</Button>
                  </View>
                ) : !items.length && !busy ? (
                  <Empty title="The road is open.">
                    Reviewed listings will appear here. Try fewer filters or be
                    the first to list your car.
                  </Empty>
                ) : (
                  items.map((c) => (
                    <CarCard
                      key={c.id}
                      car={c}
                      isSaved={saved.some((l) => l.id === c.id)}
                      isCompared={compare.some((l) => l.id === c.id)}
                      openCar={openCar}
                      favourite={favourite}
                      toggleCompare={toggleCompare}
                    />
                  ))
                )}
                {pages > 1 && (
                  <View style={[s.row, { gap: 16, justifyContent: "center" }]}>
                    <Button
                      outline
                      disabled={page <= 1 || busy}
                      onPress={() => load(filters, page - 1)}
                    >
                      ←
                    </Button>
                    <Text style={{ color: "#9b9b96" }}>
                      {page} / {pages}
                    </Text>
                    <Button
                      outline
                      disabled={page >= pages || busy}
                      onPress={() => load(filters, page + 1)}
                    >
                      →
                    </Button>
                  </View>
                )}
                <Text style={s.disclaimer}>
                  *Illustrative finance at 11.75% over 72 months, no deposit or
                  balloon, excluding fees. Use the calculator to explore your
                  own assumptions.
                </Text>
                <View style={s.promo}>
                  <Text style={s.lightEyebrow}>TIME FOR SOMETHING NEW?</Text>
                  <Text style={[s.title, { color: "#fff" }]}>
                    Good cars deserve a great next chapter.
                  </Text>
                  <Button
                    outline
                    onPress={() => {
                      setTab("Sell");
                      setConsent(false);
                    }}
                  >
                    Sell your car ↗
                  </Button>
                </View>
              </View>
            </>
          )}
          {tab === "Saved" && (
            <View style={s.content}>
              <Text style={s.eyebrow}>YOUR CORNER OF THE ROAD</Text>
              <Text style={s.title}>My garage.</Text>
              {!user ? (
                requireSignIn
              ) : (
                <>
                  <Text style={s.subtitle}>The ones that caught your eye.</Text>
                  {saved.length ? (
                    saved.map((c) => (
                      <CarCard
                        key={c.id}
                        car={c}
                        isSaved={saved.some((l) => l.id === c.id)}
                        isCompared={compare.some((l) => l.id === c.id)}
                        openCar={openCar}
                        favourite={favourite}
                        toggleCompare={toggleCompare}
                      />
                    ))
                  ) : (
                    <Empty title="Keep the good ones close.">
                      Tap the heart on a car to save it here.
                    </Empty>
                  )}
                  <Text style={s.subtitle}>Saved searches</Text>
                  {searches.map((ss) => (
                    <View key={ss.id} style={s.panel}>
                      <Text style={s.subtitle}>{ss.name}</Text>
                      <Text style={s.small}>
                        {Object.entries(ss.filters)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ") || "All cars"}
                      </Text>
                      <View style={[s.row, { gap: 24, marginTop: 20 }]}>
                        <Pressable
                          onPress={() => {
                            setFilters(ss.filters);
                            setQuery(ss.filters.q || "");
                            setTab("Explore");
                            load(ss.filters);
                          }}
                        >
                          <Text style={s.link}>Search again ↗</Text>
                        </Pressable>
                        <Pressable
                          onPress={async () => {
                            try {
                              await api.delete(`/me/searches/${ss.id}`);
                              refreshAccount();
                            } catch (e) {
                              report(e);
                            }
                          }}
                        >
                          <Text style={s.small}>Remove</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                  <Text style={s.disclaimer}>
                    Saved searches are bookmarks. Email or push alerts are not
                    enabled.
                  </Text>
                </>
              )}
            </View>
          )}
          {tab === "Sell" && (
            <View style={s.content}>
              <Text style={s.eyebrow}>A NEW CHAPTER FOR YOUR CAR</Text>
              <Text style={s.title}>
                {editId ? "Make it shine." : "Great car. New possibilities."}
              </Text>
              {!user ? (
                requireSignIn
              ) : !canSell(user) ? (
                <View style={s.panel}>
                  <Text style={s.subtitle}>
                    Business account ·{" "}
                    {user.businessStatus
                      ? bizStatusText[user.businessStatus]
                      : "not activated"}
                  </Text>
                  <Text style={s.muted}>
                    Dealerships and professional sellers can advertise once
                    AutoCars has reviewed their application and agreed terms.
                    You can still browse cars and send enquiries.
                  </Text>
                  <Button outline onPress={() => setTab("Account")}>
                    Open business account ↗
                  </Button>
                </View>
              ) : (
                <>
                  <View style={s.stepRow}>
                    {[
                      "Essentials",
                      "Photos & story",
                      "Your details",
                      ...(needsAdFee ? ["Advertisement"] : []),
                    ].map((x, i) => (
                      <Text
                        key={x}
                        style={[s.step, i === step && s.stepActive]}
                      >
                        {i + 1}. {x}
                      </Text>
                    ))}
                  </View>
                  {step === 0 ? (
                    <>
                      <Field
                        label="Make"
                        value={form.make}
                        onChange={(v) => update("make", v)}
                        placeholder="e.g. Toyota"
                      />
                      <Field
                        label="Model"
                        value={form.model}
                        onChange={(v) => update("model", v)}
                        placeholder="e.g. Corolla Cross"
                      />
                      <Field
                        label="Variant (optional)"
                        value={form.variant}
                        onChange={(v) => update("variant", v)}
                      />
                      <Field
                        label="Year"
                        numeric
                        value={form.year}
                        onChange={(v) => update("year", v)}
                      />
                      <Field
                        label="Asking price (R)"
                        numeric
                        value={form.price}
                        onChange={(v) => update("price", v)}
                      />
                      <Field
                        label="Mileage (km)"
                        numeric
                        value={form.mileage}
                        onChange={(v) => update("mileage", v)}
                      />
                      <Select
                        label="Body type"
                        value={form.bodyType}
                        values={bodyTypes}
                        onChange={(v) => update("bodyType", v)}
                      />
                      <Select
                        label="Fuel"
                        value={form.fuel}
                        values={fuels}
                        onChange={(v) => update("fuel", v)}
                      />
                      <Select
                        label="Transmission"
                        value={form.transmission}
                        values={["Automatic", "Manual"]}
                        onChange={(v) => update("transmission", v)}
                      />
                    </>
                  ) : step === 1 ? (
                    <>
                      <Text style={s.subtitle}>Show its best side.</Text>
                      <Text style={s.muted}>
                        Up to 12 photos, under 8 MB each. Your first photo is
                        the cover.
                      </Text>
                      <Button
                        outline
                        onPress={choosePhotos}
                        disabled={uploading || form.images.length >= 12}
                      >
                        {uploading ? "Uploading…" : "Choose photos +"}
                      </Button>
                      <View style={s.photoGrid}>
                        {form.images.map((img, i) => (
                          <View key={img} style={s.uploadPhoto}>
                            <Image
                              source={{ uri: api.image(img) }}
                              style={{
                                width: "100%",
                                height: 100,
                                borderRadius: 5,
                              }}
                            />
                            <Pressable
                              accessibilityLabel="Remove photo"
                              style={s.removePhoto}
                              onPress={async () => {
                                update(
                                  "images",
                                  form.images.filter((x) => x !== img),
                                );
                                if (!editId)
                                  try {
                                    await api.delete(
                                      `/uploads/${img.split("/").pop()?.replace(".webp", "")}`,
                                    );
                                  } catch (e) {
                                    report(e);
                                  }
                              }}
                            >
                              <Text style={{ color: "#f2f2f0" }}>×</Text>
                            </Pressable>
                            {i === 0 && (
                              <Text style={s.small}>Cover photo</Text>
                            )}
                          </View>
                        ))}
                      </View>
                      <Field
                        label="Tell its story (at least 30 characters)"
                        value={form.description}
                        onChange={(v) => update("description", v)}
                        multiline
                        placeholder="Condition, service history, features…"
                      />
                    </>
                  ) : step === 3 ? (
                    <>
                      <Text style={s.subtitle}>Your advertisement.</Text>
                      <Text style={s.muted}>
                        Private sellers pay a one-off {money(brand.adFee)} to
                        advertise for {brand.adDays} days. Dealerships advertise
                        under agreed commercial terms instead.
                      </Text>
                      <Text style={s.disclaimer}>
                        Native advertisement purchases must be configured with
                        store billing before release. This build does not
                        collect card details or simulate successful payments.
                        You can browse, enquire and manage advertisements
                        already on your account.
                      </Text>
                    </>
                  ) : (
                    <>
                      <Field
                        label="Seller or dealership name"
                        value={form.sellerName}
                        onChange={(v) => update("sellerName", v)}
                      />
                      <Field
                        label="Phone number"
                        value={form.phone}
                        onChange={(v) => update("phone", v)}
                      />
                      <Select
                        label="Province"
                        value={form.province}
                        values={provinces}
                        onChange={(v) => update("province", v)}
                      />
                      <Field
                        label="City or town"
                        value={form.city}
                        onChange={(v) => update("city", v)}
                      />
                      <View style={s.panel}>
                        <Text style={s.subtitle}>
                          {form.year} {form.make} {form.model}
                        </Text>
                        <Text style={{ color: "#9b9b96" }}>
                          {money(Number(form.price))} · {form.images.length}{" "}
                          photos
                        </Text>
                      </View>
                      <CheckBox
                        value={!!form.greatValue}
                        onChange={(v) => update("greatValue", v)}
                      >
                        Mark as great value — priced to sell
                      </CheckBox>
                      <CheckBox value={consent} onChange={setConsent}>
                        I have the right to advertise this car, the details are
                        accurate, and I accept the marketplace terms.
                      </CheckBox>
                      <Text style={s.disclaimer}>
                        New and edited listings are reviewed before appearing
                        publicly.
                      </Text>
                    </>
                  )}
                  <Button
                    disabled={
                      busy || uploading || (needsAdFee && step === lastStep)
                    }
                    onPress={step < lastStep ? nextStep : submitListing}
                  >
                    {busy
                      ? "Submitting…"
                      : step === lastStep
                        ? needsAdFee
                          ? "Purchases unavailable in this build"
                          : "Submit for review ↗"
                        : "Continue →"}
                  </Button>
                  {step > 0 && (
                    <Button outline onPress={() => setStep(step - 1)}>
                      Back
                    </Button>
                  )}
                  {editId && (
                    <Button
                      outline
                      onPress={() => {
                        setEditId(null);
                        setForm({ ...fresh, sellerName: user.name });
                        setStep(0);
                      }}
                    >
                      Cancel edit
                    </Button>
                  )}
                </>
              )}
            </View>
          )}
          {tab === "Inbox" && (
            <View style={s.content}>
              <Text style={s.eyebrow}>KEEP THE CONVERSATION MOVING</Text>
              <Text style={s.title}>Your enquiries.</Text>
              {!user ? (
                requireSignIn
              ) : leads.length ? (
                leads.map((l) => (
                  <Pressable
                    key={l.id}
                    style={s.panel}
                    onPress={() =>
                      openChat(
                        l.id,
                        `${l.name} — ${l.year} ${l.make} ${l.model}`,
                      )
                    }
                  >
                    <Text style={s.subtitle}>
                      {l.name}
                      {!!l.unread && <Text style={s.unreadDot}> ● new</Text>}
                    </Text>
                    <Text style={s.small}>
                      {l.year} {l.make} {l.model}
                    </Text>
                    <Text style={[s.muted, { marginVertical: 20 }]}>
                      {l.message}
                    </Text>
                    <Select
                      label="Status"
                      value={l.status}
                      values={["new", "contacted", "closed"]}
                      onChange={async (status) => {
                        try {
                          await api.patch(`/me/leads/${l.id}`, { status });
                          refreshAccount();
                        } catch (e) {
                          report(e);
                        }
                      }}
                    />
                    <View style={[s.row, { gap: 25 }]}>
                      <Pressable
                        onPress={() =>
                          openChat(
                            l.id,
                            `${l.name} — ${l.year} ${l.make} ${l.model}`,
                          )
                        }
                      >
                        <Text style={s.link}>Message</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => Linking.openURL(`mailto:${l.email}`)}
                      >
                        <Text style={s.link}>Email buyer ↗</Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          Linking.openURL(
                            `tel:${l.phone.replace(/[^+\d]/g, "")}`,
                          )
                        }
                      >
                        <Text style={s.link}>Call buyer ↗</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                ))
              ) : (
                <Empty title="Your next conversation is on its way.">
                  Enquiries about your listings will appear here.
                </Empty>
              )}
              {enquiries.length > 0 && (
                <>
                  <Text style={[s.eyebrow, { marginTop: 30 }]}>
                    ENQUIRIES YOU SENT
                  </Text>
                  {enquiries.map((e) => (
                    <Pressable
                      key={e.id}
                      style={s.panel}
                      onPress={() =>
                        openChat(e.id, `${e.year} ${e.make} ${e.model}`)
                      }
                    >
                      <Text style={s.subtitle}>
                        {e.year} {e.make} {e.model}
                        {!!e.unread && <Text style={s.unreadDot}> ● new</Text>}
                      </Text>
                      <Text style={[s.muted, { marginVertical: 14 }]}>
                        {e.message}
                      </Text>
                      <View style={s.row}>
                        <Pressable
                          onPress={() =>
                            openChat(e.id, `${e.year} ${e.make} ${e.model}`)
                          }
                        >
                          <Text style={s.link}>Message seller</Text>
                        </Pressable>
                        <Text style={s.small}>
                          {new Date(e.createdAt).toLocaleDateString("en-ZA")}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </>
              )}
            </View>
          )}
          {tab === "Account" && (
            <View style={s.content}>
              <Text style={s.eyebrow}>YOU'RE IN THE DRIVER'S SEAT</Text>
              <Text style={s.title}>
                {user
                  ? `Hello, ${user.name.split(" ")[0]}.`
                  : authMode === "register"
                    ? "Let’s get you on the road."
                    : authMode === "forgot"
                      ? "Find your way back."
                      : authMode === "reset"
                        ? "A fresh start."
                        : "Good to see you."}
              </Text>
              {user && authMode !== "reset" ? (
                <>
                  <Text style={s.muted}>
                    {user.email} ·{" "}
                    {user.verified ? "Email verified" : "Email not verified"}
                  </Text>
                  {!user.verified && (
                    <Button
                      outline
                      onPress={async () => {
                        try {
                          await api.post("/auth/verify/send");
                          notify(
                            "Check your inbox",
                            "Verification email sent.",
                          );
                        } catch (e) {
                          report(e);
                        }
                      }}
                    >
                      Verify email ↗
                    </Button>
                  )}
                  <Button outline onPress={() => setShowMine(!showMine)}>
                    {showMine ? "Hide my listings" : "My listings"} ·{" "}
                    {mine.length}
                  </Button>
                  {showMine &&
                    mine.map((l) => (
                      <View key={l.id} style={s.panel}>
                        <Pressable onPress={() => openCar(l)}>
                          <Text style={s.subtitle}>
                            {l.year} {l.make} {l.model}
                          </Text>
                        </Pressable>
                        <Text style={s.small}>
                          {money(l.price)} · {l.status.toUpperCase()}
                        </Text>
                        {l.paidUntil && (
                          <Text
                            style={[
                              s.small,
                              { marginTop: 6 },
                              adExpired(l) && { color: "#f07364" },
                            ]}
                          >
                            {adExpired(l)
                              ? "Ad expired"
                              : `Ad until ${new Date(l.paidUntil).toLocaleDateString("en-ZA")}`}
                          </Text>
                        )}
                        {l.rejectionReason && (
                          <Text
                            style={[
                              s.small,
                              { color: "#f07364", marginTop: 12 },
                            ]}
                          >
                            {l.rejectionReason}
                          </Text>
                        )}
                        <View style={[s.row, { gap: 22, marginTop: 18 }]}>
                          {l.paidUntil && (
                            <Pressable
                              onPress={() => {
                                setRenewTarget(l);
                                setRenewCard("");
                                setRenewMsg("");
                              }}
                            >
                              <Text style={s.link}>Renew ad</Text>
                            </Pressable>
                          )}
                          <Pressable
                            onPress={() => {
                              setEditId(l.id);
                              setForm({
                                ...l,
                                year: String(l.year),
                                price: String(l.price),
                                mileage: String(l.mileage),
                              });
                              setStep(0);
                              setConsent(false);
                              setTab("Sell");
                            }}
                          >
                            <Text style={s.link}>Edit ↗</Text>
                          </Pressable>
                          {l.status !== "sold" && (
                            <Pressable
                              onPress={() =>
                                notify(
                                  "Mark sold?",
                                  "This removes the car from search.",
                                  [
                                    { text: "Cancel", style: "cancel" },
                                    {
                                      text: "Mark sold",
                                      onPress: async () => {
                                        try {
                                          await api.post(
                                            `/listings/${l.id}/sold`,
                                          );
                                          refreshAccount();
                                          load();
                                        } catch (e) {
                                          report(e);
                                        }
                                      },
                                    },
                                  ],
                                )
                              }
                            >
                              <Text style={s.link}>Mark sold</Text>
                            </Pressable>
                          )}
                          <Pressable
                            onPress={() =>
                              notify(
                                "Delete listing?",
                                "This permanently removes the listing and its enquiries.",
                                [
                                  { text: "Cancel", style: "cancel" },
                                  {
                                    text: "Delete",
                                    style: "destructive",
                                    onPress: async () => {
                                      try {
                                        await api.delete(`/listings/${l.id}`);
                                        refreshAccount();
                                        load();
                                      } catch (e) {
                                        report(e);
                                      }
                                    },
                                  },
                                ],
                              )
                            }
                          >
                            <Text style={[s.link, { color: "#f07364" }]}>
                              Delete
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  {user.accountType === "business" && (
                    <View
                      style={s.panel}
                      onLayout={(e) => {
                        businessPosition.current = e.nativeEvent.layout.y;
                        if (accountScroll.current) {
                          contentScroll.current?.scrollTo({
                            y: businessPosition.current,
                            animated: true,
                          });
                          accountScroll.current = false;
                        }
                      }}
                    >
                      <Text style={s.subtitle}>Business account</Text>
                      <Text style={s.small}>
                        {bizApp
                          ? bizStatusText[bizApp.status]
                          : "No application yet"}
                      </Text>
                      {bizApp?.reviewNote ? (
                        <Text style={s.muted}>{bizApp.reviewNote}</Text>
                      ) : null}
                      {bizApp?.status === "active" &&
                      bizApp.agreementReference ? (
                        <Text style={s.small}>
                          Agreement: {bizApp.agreementReference}
                        </Text>
                      ) : null}
                      {(!bizApp ||
                        bizApp.status === "pending" ||
                        bizApp.status === "rejected") && (
                        <>
                          <Button
                            outline
                            onPress={() => setBizFormOpen(!bizFormOpen)}
                          >
                            {bizFormOpen
                              ? "Hide application"
                              : bizApp
                                ? "Update application"
                                : "Business application"}
                          </Button>
                          {bizFormOpen && (
                            <>
                              <Field
                                label="Business name"
                                value={biz.businessName}
                                onChange={(v) => updateBiz("businessName", v)}
                              />
                              <Field
                                label="Registration number (optional)"
                                value={biz.registrationNumber}
                                onChange={(v) =>
                                  updateBiz("registrationNumber", v)
                                }
                              />
                              <Field
                                label="Contact person"
                                value={biz.contactName}
                                onChange={(v) => updateBiz("contactName", v)}
                              />
                              <Field
                                label="Business phone"
                                value={biz.phone}
                                onChange={(v) => updateBiz("phone", v)}
                              />
                              <Select
                                label="Province"
                                value={biz.province}
                                values={provinces}
                                onChange={(v) => updateBiz("province", v)}
                              />
                              <Field
                                label="City or town"
                                value={biz.city}
                                onChange={(v) => updateBiz("city", v)}
                              />
                              <Field
                                label="Website (optional)"
                                value={biz.website}
                                onChange={(v) => updateBiz("website", v)}
                              />
                              <Field
                                label="Anything we should know? (optional)"
                                value={biz.message}
                                onChange={(v) => updateBiz("message", v)}
                                multiline
                              />
                              <CheckBox
                                value={bizConsent}
                                onChange={setBizConsent}
                              >
                                I agree that AutoCars may contact me about this
                                business application.
                              </CheckBox>
                              <Button
                                disabled={busy || !bizConsent}
                                onPress={submitBusiness}
                              >
                                Submit application ↗
                              </Button>
                            </>
                          )}
                        </>
                      )}
                      {(bizApp?.status === "contacted" ||
                        bizApp?.status === "suspended" ||
                        bizApp?.status === "active") && (
                        <Text style={s.disclaimer}>
                          Selling is enabled once your agreed terms are
                          activated by the AutoCars team.
                        </Text>
                      )}
                    </View>
                  )}
                  <Button outline onPress={() => setFinanceOpen(true)}>
                    Finance calculator ↗
                  </Button>
                  <Button
                    outline
                    onPress={async () => {
                      try {
                        const data = await api.get("/me/export");
                        await Share.share({
                          message: JSON.stringify(data, null, 2),
                          title: `${brand.name} account data`,
                        });
                      } catch (e) {
                        report(e);
                      }
                    }}
                  >
                    Export my account data ↗
                  </Button>
                  {user.role === "admin" && (
                    <Text style={s.disclaimer}>
                      The full administration workspace is available on the
                      website at /workspace.
                    </Text>
                  )}
                  <View style={s.panel}>
                    <Text style={s.subtitle}>Notifications</Text>
                    <Text style={s.muted}>
                      {nativePushAvailable
                        ? "Get listing reviews, buyer enquiries and business updates when the app is closed."
                        : "Remote push is available in your own signed app build. Expo Go can still receive live updates while open."}
                    </Text>
                    {nativePushAvailable && (
                      <>
                        <Button
                          disabled={pushBusy}
                          onPress={async () => {
                            setPushBusy(true);
                            try {
                              await enableNativePush(api);
                              notify(
                                "Notifications enabled",
                                "This device is now registered.",
                              );
                            } catch (e) {
                              report(e);
                            } finally {
                              setPushBusy(false);
                            }
                          }}
                        >
                          Enable push notifications
                        </Button>
                        <Button
                          outline
                          onPress={async () => {
                            try {
                              await api.post("/me/push/test");
                              notify(
                                "Test queued",
                                "Check your device notifications.",
                              );
                            } catch (e) {
                              report(e);
                            }
                          }}
                        >
                          Send test notification
                        </Button>
                        <Button
                          outline
                          onPress={async () => {
                            try {
                              await disableNativePush(api);
                              notify(
                                "Notifications disabled",
                                "This device has been unregistered.",
                              );
                            } catch (e) {
                              report(e);
                            }
                          }}
                        >
                          Disable push notifications
                        </Button>
                      </>
                    )}
                    {notices.slice(0, 10).map((n) => (
                      <Pressable
                        key={n.id}
                        accessibilityRole="button"
                        onPress={() => setNotificationPath(n.path)}
                        style={{
                          paddingVertical: 15,
                          borderTopWidth: 1,
                          borderColor: "#333",
                        }}
                      >
                        <Text style={s.label}>{n.title}</Text>
                        <Text style={s.small}>{n.body}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Button onPress={logout}>Sign out</Button>
                  {user.role !== "admin" && (
                    <Button
                      outline
                      onPress={() => {
                        setPassword("");
                        setDeleteOpen(true);
                      }}
                    >
                      Delete my account
                    </Button>
                  )}
                </>
              ) : (
                <>
                  {authMode === "register" && (
                    <>
                      <Field
                        label="Your name"
                        value={name}
                        onChange={setName}
                      />
                      <Text style={s.label}>I am joining as</Text>
                      <View style={[s.row, { gap: 10, marginBottom: 20 }]}>
                        {(
                          [
                            ["customer", "Personal"],
                            ["business", "Business / dealer"],
                          ] as const
                        ).map(([v, label]) => (
                          <Pressable
                            key={v}
                            accessibilityRole="button"
                            onPress={() => setAccountType(v)}
                            style={[
                              s.accountType,
                              accountType === v && s.accountTypeActive,
                            ]}
                          >
                            <Text
                              style={[
                                s.accountTypeText,
                                accountType === v && { color: "#111" },
                              ]}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      {accountType === "business" && (
                        <View style={s.panel}>
                          <Text style={s.subtitle}>Business details</Text>
                          <Text style={s.muted}>
                            Dealerships and professional sellers apply here. Our
                            team reviews every application and agrees commercial
                            terms before business selling is activated.
                          </Text>
                          <Field
                            label="Business name"
                            value={biz.businessName}
                            onChange={(v) => updateBiz("businessName", v)}
                          />
                          <Field
                            label="Registration number (optional)"
                            value={biz.registrationNumber}
                            onChange={(v) => updateBiz("registrationNumber", v)}
                          />
                          <Field
                            label="Contact person"
                            value={biz.contactName}
                            onChange={(v) => updateBiz("contactName", v)}
                          />
                          <Field
                            label="Business phone"
                            value={biz.phone}
                            onChange={(v) => updateBiz("phone", v)}
                          />
                          <Select
                            label="Province"
                            value={biz.province}
                            values={provinces}
                            onChange={(v) => updateBiz("province", v)}
                          />
                          <Field
                            label="City or town"
                            value={biz.city}
                            onChange={(v) => updateBiz("city", v)}
                          />
                          <Field
                            label="Website (optional)"
                            value={biz.website}
                            onChange={(v) => updateBiz("website", v)}
                          />
                          <Field
                            label="Anything we should know? (optional)"
                            value={biz.message}
                            onChange={(v) => updateBiz("message", v)}
                            multiline
                          />
                          <CheckBox value={bizConsent} onChange={setBizConsent}>
                            I agree that AutoCars may contact me about this
                            business application.
                          </CheckBox>
                        </View>
                      )}
                    </>
                  )}
                  <Field
                    label="Email address"
                    value={email}
                    onChange={setEmail}
                  />
                  {authMode !== "forgot" && (
                    <Field
                      label={
                        authMode === "login"
                          ? "Password"
                          : "Password (at least 12 characters)"
                      }
                      secure
                      value={password}
                      onChange={setPassword}
                    />
                  )}
                  {authMode === "register" && (
                    <CheckBox value={consent} onChange={setConsent}>
                      I accept the privacy notice and marketplace terms.
                    </CheckBox>
                  )}
                  <Button disabled={busy} onPress={signIn}>
                    {busy
                      ? "One moment…"
                      : authMode === "register"
                        ? "Create account →"
                        : authMode === "forgot"
                          ? "Send recovery link →"
                          : authMode === "reset"
                            ? "Set new password →"
                            : "Sign in →"}
                  </Button>
                  <Button
                    outline
                    onPress={() => {
                      setAuthMode(authMode === "login" ? "register" : "login");
                      setConsent(false);
                      setPassword("");
                    }}
                  >
                    {authMode === "login"
                      ? "New here? Create an account"
                      : "Back to sign in"}
                  </Button>
                  {authMode === "login" && (
                    <Pressable onPress={() => setAuthMode("forgot")}>
                      <Text
                        style={[
                          s.link,
                          { textAlign: "center", marginVertical: 15 },
                        ]}
                      >
                        Forgot your password?
                      </Text>
                    </Pressable>
                  )}
                </>
              )}
              <Pressable onPress={() => setLegalOpen(true)}>
                <Text style={[s.link, { marginVertical: 25 }]}>
                  Privacy & marketplace terms ↗
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {compare.length > 0 && (
        <Pressable style={s.compareBar} onPress={() => setCompareOpen(true)}>
          <Text style={{ color: "#111", fontSize: 12 }}>
            ⇄ Compare cars · {compare.length}/3
          </Text>
          <Text style={{ color: "#111" }}>↗</Text>
        </Pressable>
      )}
      <SafeAreaView edges={["bottom"]} style={s.tabBar}>
        <View style={s.tabs}>
          {(["Explore", "Saved", "Sell", "Inbox", "Account"] as Tab[]).map(
            (t, i) => (
              <Pressable
                key={t}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t }}
                style={s.tab}
                onPress={() => {
                  setTab(t);
                  if (t === "Sell") setConsent(false);
                  if (
                    user &&
                    (t === "Inbox" || t === "Saved" || t === "Account")
                  )
                    refreshAccount();
                }}
              >
                <Text
                  style={[s.tabIcon, tab === t && { color: brand.primary }]}
                >
                  {["⌕", "♡", "＋", "▱", "◉"][i]}
                </Text>
                <Text
                  style={[
                    s.tabText,
                    tab === t && { color: brand.primary, fontWeight: "700" },
                  ]}
                >
                  {t}
                  {t === "Inbox" && unreadTotal > 0 && (
                    <Text style={s.tabBadge}> {unreadTotal}</Text>
                  )}
                </Text>
              </Pressable>
            ),
          )}
        </View>
      </SafeAreaView>
      <Modal
        visible={filterOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setFilterOpen(false)}
      >
        <SafeAreaView style={s.screen}>
          {modalHeader("Find your kind of drive", () => setFilterOpen(false))}
          <ScrollView contentContainerStyle={s.content}>
            <Select
              label="Province"
              value={filters.province || ""}
              values={["", ...provinces]}
              onChange={(v) => setFilters({ ...filters, province: v })}
            />
            <Select
              label="Body type"
              value={filters.bodyType || ""}
              values={["", ...bodyTypes]}
              onChange={(v) => setFilters({ ...filters, bodyType: v })}
            />
            <Select
              label="Fuel"
              value={filters.fuel || ""}
              values={["", ...fuels]}
              onChange={(v) => setFilters({ ...filters, fuel: v })}
            />
            <Select
              label="Transmission"
              value={filters.transmission || ""}
              values={["", "Automatic", "Manual"]}
              onChange={(v) => setFilters({ ...filters, transmission: v })}
            />
            <Field
              label="Minimum price (R)"
              numeric
              value={filters.minPrice || ""}
              onChange={(v) => setFilters({ ...filters, minPrice: v })}
            />
            <Field
              label="Maximum price (R)"
              numeric
              value={filters.maxPrice || ""}
              onChange={(v) => setFilters({ ...filters, maxPrice: v })}
            />
            <Field
              label="Year from"
              numeric
              value={filters.minYear || ""}
              onChange={(v) => setFilters({ ...filters, minYear: v })}
            />
            <Field
              label="Maximum mileage"
              numeric
              value={filters.maxMileage || ""}
              onChange={(v) => setFilters({ ...filters, maxMileage: v })}
            />
            <Select
              label="Sort"
              value={filters.sort || "newest"}
              values={["newest", "price-asc", "price-desc", "mileage", "year"]}
              onChange={(v) => setFilters({ ...filters, sort: v })}
            />
            <CheckBox
              value={filters.greatValue === "true"}
              onChange={(v) =>
                setFilters({ ...filters, greatValue: v ? "true" : "" })
              }
            >
              Great value only
            </CheckBox>
            <Button
              onPress={() => {
                setFilterOpen(false);
                load({ ...filters, q: query });
              }}
            >
              Show cars ↗
            </Button>
            <Button
              outline
              onPress={() => {
                setFilters({});
                setQuery("");
                setFilterOpen(false);
                load({});
              }}
            >
              Reset filters
            </Button>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={!!renewTarget}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setRenewTarget(null)}
      >
        <SafeAreaView style={s.screen}>
          {modalHeader("Renew advertisement", () => setRenewTarget(null))}
          <ScrollView contentContainerStyle={s.content}>
            <Text style={s.subtitle}>
              {renewTarget?.year} {renewTarget?.make} {renewTarget?.model}
            </Text>
            <Text style={s.muted}>
              {money(brand.adFee)} for another {brand.adDays} days.
            </Text>
            <Text style={s.muted}>
              Native advertisement renewal requires store billing to be
              configured for this build.
            </Text>
            <Button disabled={true} onPress={renewAd}>
              {busy ? "Paying…" : `Pay ${money(brand.adFee)} ↗`}
            </Button>
            <Button outline onPress={() => setRenewTarget(null)}>
              Cancel
            </Button>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={!!detail}
        animationType="slide"
        onRequestClose={() => setDetail(null)}
      >
        <SafeAreaView style={s.screen}>
          {modalHeader("Your next chapter", () => setDetail(null))}
          {detail && (
            <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
              <Image
                source={{
                  uri: api.image(detail.images[photo] || detail.images[0]),
                }}
                style={s.detailImage}
              />
              <View
                style={[
                  s.row,
                  { padding: 18, justifyContent: "center", gap: 25 },
                ]}
              >
                <Pressable
                  onPress={() =>
                    setPhoto(
                      (photo - 1 + detail.images.length) % detail.images.length,
                    )
                  }
                >
                  <Text style={{ color: "#f2f2f0" }}>←</Text>
                </Pressable>
                <Text style={s.small}>
                  {photo + 1} / {detail.images.length}
                </Text>
                <Pressable
                  onPress={() => setPhoto((photo + 1) % detail.images.length)}
                >
                  <Text style={{ color: "#f2f2f0" }}>→</Text>
                </Pressable>
              </View>
              <View style={s.content}>
                <Text style={s.eyebrow}>
                  {detail.year} · {detail.bodyType}
                </Text>
                {detail.greatValue && (
                  <Text style={s.inlineFlag}>GREAT VALUE</Text>
                )}
                <Text style={s.title}>
                  {detail.make} {detail.model}
                </Text>
                <Text style={s.muted}>{detail.variant}</Text>
                <Text style={s.price}>{money(detail.price)}</Text>
                <Text style={s.muted}>
                  {detail.mileage.toLocaleString()} km · {detail.transmission} ·{" "}
                  {detail.fuel}
                </Text>
                <Text style={s.small}>
                  ⌖ {detail.city}, {detail.province}
                </Text>
                <View style={s.divider} />
                <Text style={s.subtitle}>Meet your next car.</Text>
                <Text style={s.muted}>{detail.description}</Text>
                <Button outline onPress={() => favourite(detail)}>
                  {saved.some((c) => c.id === detail.id)
                    ? "♥ Saved"
                    : "♡ Save this car"}
                </Button>
                <Button outline onPress={() => toggleCompare(detail)}>
                  ⇄ Add to comparison
                </Button>
                <Button
                  outline
                  onPress={() => {
                    setPrice(String(detail.price));
                    setDeposit("0");
                    setDetail(null);
                    setFinanceOpen(true);
                  }}
                >
                  Explore monthly repayments ↗
                </Button>
                {detail.status === "published" ? (
                  <Button
                    onPress={() => {
                      if (!user) {
                        setDetail(null);
                        setTab("Account");
                        return;
                      }
                      setEnquireOpen(!enquireOpen);
                    }}
                  >
                    {user ? "Enquire about this car ↗" : "Sign in to enquire →"}
                  </Button>
                ) : (
                  <Text style={s.small}>This listing is {detail.status}.</Text>
                )}
                {enquireOpen && (
                  <View style={s.panel}>
                    <Text style={s.subtitle}>Make the first move.</Text>
                    <Field label="Your name" value={name} onChange={setName} />
                    <Field label="Email" value={email} onChange={setEmail} />
                    <Field
                      label="Phone number"
                      value={phone}
                      onChange={setPhone}
                    />
                    <Field
                      label="Message"
                      value={message}
                      onChange={setMessage}
                      multiline
                    />
                    <CheckBox
                      value={enquiryConsent}
                      onChange={setEnquiryConsent}
                    >
                      Share my contact details with this seller for this
                      enquiry.
                    </CheckBox>
                    <Button
                      disabled={busy || !enquiryConsent}
                      onPress={sendEnquiry}
                    >
                      Send enquiry ↗
                    </Button>
                  </View>
                )}
                <Text style={s.disclaimer}>
                  View the car in person, verify ownership and service history,
                  and never pay before verifying the seller. Listing review is
                  not a mechanical inspection or seller guarantee.
                </Text>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
      <Modal
        visible={financeOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setFinanceOpen(false)}
      >
        <SafeAreaView style={s.screen}>
          {modalHeader("Know your numbers", () => setFinanceOpen(false))}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.content}
          >
            <Text style={s.title}>Dream big.{"\n"}Know your budget.</Text>
            <Field
              label="Vehicle price (R)"
              numeric
              value={price}
              onChange={setPrice}
            />
            <Field
              label="Deposit (R)"
              numeric
              value={deposit}
              onChange={setDeposit}
            />
            <Field
              label="Annual interest rate (%)"
              numeric
              value={rate}
              onChange={setRate}
            />
            <Select
              label="Loan term (months)"
              value={term}
              values={["12", "24", "36", "48", "60", "72", "84"]}
              onChange={setTerm}
            />
            <Select
              label="Balloon (%)"
              value={balloon}
              values={["0", "5", "10", "15", "20", "25", "30", "35"]}
              onChange={setBalloon}
            />
            <View style={s.promo}>
              <Text style={s.lightEyebrow}>ESTIMATED MONTHLY PAYMENT</Text>
              <Text style={[s.title, { color: "#fff" }]}>
                {monthlyPayment === null ? "—" : money(monthlyPayment)}
              </Text>
              <Text style={{ color: "#9b9b96", fontSize: 12 }}>
                Final balloon:{" "}
                {balloonPayment === null ? "—" : money(balloonPayment)}
              </Text>
            </View>
            <Text style={s.disclaimer}>
              Illustrative estimate, not a finance offer. Excludes fees and
              insurance. A balloon is a final payment due at the end. Confirm
              costs with your lender.
            </Text>
            <Button
              disabled={monthlyPayment === null}
              onPress={() => {
                const f = {
                  maxPrice: String(Math.max(0, Math.round(fp ?? 0))),
                };
                setFilters(f);
                setTab("Explore");
                setFinanceOpen(false);
                load(f);
              }}
            >
              Find cars in this budget ↗
            </Button>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={compareOpen}
        animationType="slide"
        onRequestClose={() => setCompareOpen(false)}
      >
        <SafeAreaView style={s.screen}>
          {modalHeader("A little perspective.", () => setCompareOpen(false))}
          <ScrollView
            horizontal
            contentContainerStyle={{ padding: 20, gap: 18 }}
          >
            {compare.map((c) => (
              <ScrollView style={{ width: 270 }} key={c.id}>
                <Image
                  source={{ uri: api.image(c.images[0]) }}
                  style={{ width: 270, height: 180, borderRadius: 7 }}
                />
                <Text style={[s.subtitle, { marginTop: 20 }]}>
                  {c.year} {c.make} {c.model}
                </Text>
                {[
                  ["Price", money(c.price)],
                  ["Mileage", `${c.mileage.toLocaleString()} km`],
                  ["Transmission", c.transmission],
                  ["Fuel", c.fuel],
                  ["Location", c.city],
                ].map(([k, v]) => (
                  <View key={k} style={s.compareRow}>
                    <Text style={s.small}>{k}</Text>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "600",
                        marginTop: 9,
                        color: "#f2f2f0",
                      }}
                    >
                      {v}
                    </Text>
                  </View>
                ))}
                <Button outline onPress={() => toggleCompare(c)}>
                  Remove
                </Button>
              </ScrollView>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={legalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLegalOpen(false)}
      >
        <SafeAreaView style={s.screen}>
          {modalHeader("Privacy & terms", () => setLegalOpen(false))}
          <ScrollView contentContainerStyle={s.content}>
            <Text style={s.title}>Clarity matters.</Text>
            <Text style={s.muted}>
              We store your account, saved cars, searches, listings, photos and
              enquiry details. Published listings show seller name, vehicle
              details, photos and location. Enquiry contacts are shared with the
              seller. Photos are re-encoded to remove metadata. Passwords and
              server session tokens are hashed. This app uses secure device
              storage for the session token.
            </Text>
            <Text style={s.subtitle}>Your choices</Text>
            <Text style={s.muted}>
              Export or delete your account from Account. Deletion removes your
              listings and photos. Enquiries sent to other sellers remain in
              their records, detached from your account. Contact the operator
              for removal of those records and backup retention details.
            </Text>
            <Text style={s.subtitle}>Marketplace terms</Text>
            <Text style={s.muted}>
              Only list cars you have the right to advertise. Be accurate,
              inspect cars before buying, and verify ownership and payment
              details. We connect buyers and sellers; no vehicle payments or
              escrow are handled in this app. Moderation is not a mechanical
              inspection. Finance calculations are illustrative estimates.
            </Text>
            <Text style={s.subtitle}>Operator information</Text>
            <Text style={s.muted}>
              {brand.supportEmail ||
                "Operator contact and legal details must be configured before public release."}
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={deleteOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDeleteOpen(false)}
      >
        <SafeAreaView style={s.screen}>
          {modalHeader("Delete account", () => setDeleteOpen(false))}
          <View style={s.content}>
            <Text style={s.title}>This is permanent.</Text>
            <Text style={s.muted}>
              Your listings, photos, saved searches and account will be removed.
              Enquiries you sent to other sellers remain in their records,
              detached from your account.
            </Text>
            <Field
              label="Confirm your password"
              secure
              value={password}
              onChange={setPassword}
            />
            <Button
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await api.request("/me", {
                    method: "DELETE",
                    body: JSON.stringify({ password }),
                  });
                  api.token = null;
                  await SecureStore.deleteItemAsync(tokenKey);
                  liveRef.current?.reconnect();
                  setDeleteOpen(false);
                  setPassword("");
                  await refreshAccount();
                  load();
                  notify("Account deleted", "Your account has been removed.");
                } catch (e) {
                  report(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Permanently delete account
            </Button>
          </View>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={!!chat}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onShow={() => {
          forceChatLatest.current = true;
          scrollChatToLatest();
        }}
        onRequestClose={closeChat}
        onDismiss={() => {
          const pending = chatListing.current;
          chatListing.current = null;
          if (pending && pending.navigation === notificationNavigation.current)
            openCar(pending.listing);
        }}
      >
        <KeyboardAvoidingView
          style={s.screen}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <SafeAreaView style={s.flex}>
            <View style={[s.row, s.modalHeader]}>
              <Pressable
                style={{ flex: 1 }}
                accessibilityRole="link"
                accessibilityLabel={`View listing: ${chat?.title || "vehicle"}`}
                onPress={async () => {
                  if (!chat) return;
                  const listingId = chat.listingId;
                  const navigation = ++notificationNavigation.current;
                  Keyboard.dismiss();
                  try {
                    const r = await api.get(`/listings/${listingId}`);
                    if (notificationNavigation.current === navigation) {
                      if (Platform.OS === "ios")
                        chatListing.current = {
                          listing: r.listing,
                          navigation,
                        };
                      setChat(null);
                      if (Platform.OS !== "ios") openCar(r.listing);
                    }
                  } catch (e) {
                    Alert.alert("Vehicle unavailable", (e as Error).message);
                  }
                }}
              >
                <Text style={s.subtitle} numberOfLines={2}>
                  {chat?.title || "Conversation"}
                </Text>
                <Text style={s.link}>View vehicle ↗</Text>
              </Pressable>
              <Pressable accessibilityLabel="Close chat" onPress={closeChat}>
                <Text style={s.close}>×</Text>
              </Pressable>
            </View>
            <ScrollView
              ref={chatScroll}
              style={s.flex}
              contentContainerStyle={{
                padding: 20,
                gap: 10,
                flexGrow: 1,
                justifyContent: "flex-end",
              }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={
                Platform.OS === "ios" ? "interactive" : "on-drag"
              }
              onContentSizeChange={() => scrollChatToLatest()}
              onLayout={() => scrollChatToLatest()}
              scrollEventThrottle={16}
              onScroll={({
                nativeEvent: { contentOffset, contentSize, layoutMeasurement },
              }) => {
                followChat.current =
                  contentSize.height -
                    layoutMeasurement.height -
                    contentOffset.y <
                  80;
                if (followChat.current) forceChatLatest.current = false;
              }}
            >
              {chatTruncated && (
                <Text style={s.small}>
                  Original enquiry and the latest 500 replies.
                </Text>
              )}
              {!chatMsgs.length && (
                <Text style={[s.muted, { textAlign: "center", marginTop: 40 }]}>
                  No messages yet — say hello to get the conversation started.
                </Text>
              )}
              {chatMsgs.map((m) => {
                const own = m.senderId === user?.id;
                return (
                  <View
                    key={m.id}
                    style={[s.bubble, own ? s.bubbleOwn : s.bubbleOther]}
                  >
                    {!own && <Text style={s.bubbleSender}>{m.senderName}</Text>}
                    <Text style={own ? s.bubbleOwnText : s.bubbleText}>
                      {m.body}
                    </Text>
                    <Text style={own ? s.bubbleOwnTime : s.bubbleTime}>
                      {new Date(m.createdAt).toLocaleTimeString("en-ZA", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
            <View style={s.chatBar} onLayout={() => scrollChatToLatest()}>
              <TextInput
                accessibilityLabel="Message"
                style={s.chatInput}
                value={chatDraft}
                onChangeText={setChatDraft}
                placeholder="Write a message…"
                placeholderTextColor="#8d8d88"
                multiline
                maxLength={2000}
                onFocus={() => {
                  followChat.current = true;
                  forceChatLatest.current = true;
                  requestAnimationFrame(() => scrollChatToLatest());
                }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                style={[
                  s.chatSend,
                  (!chatDraft.trim() || busy) && { opacity: 0.4 },
                ]}
                disabled={!chatDraft.trim() || busy}
                onPress={sendChat}
              >
                <Text style={s.chatSendText}>Send</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
      {toast && (
        <View style={s.toastWrap} pointerEvents="none">
          <Pressable style={s.toast} onPress={() => setToast(null)}>
            <Text style={s.toastTitle}>{toast.title}</Text>
            <Text style={s.toastMessage}>{toast.message}</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0a0a0a", color: "#f2f2f0" },
  flex: { flex: 1, color: "#f2f2f0" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  header: {
    height: 66,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: "#2a2a2a",
  },
  logo: {
    width: 126,
    height: 29,
    resizeMode: "contain",
    backgroundColor: "#000",
    borderRadius: 4,
  },
  link: { fontSize: 11, fontWeight: "600", color: brand.primary },
  content: { padding: 22 },
  hero: { height: 330 },
  heroShade: { flex: 1, backgroundColor: "#0008", padding: 25, paddingTop: 45 },
  lightEyebrow: {
    color: "#d5d5d0",
    fontSize: 8,
    letterSpacing: 1.8,
    marginBottom: 20,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 43,
    fontWeight: "500",
    letterSpacing: -2,
    lineHeight: 48,
  },
  heroItalic: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontStyle: "italic",
  },
  heroSubtitle: { color: "#d5d5d0", fontSize: 12, marginTop: 20 },
  eyebrow: {
    fontSize: 8,
    color: "#9b9b96",
    letterSpacing: 1.5,
    fontWeight: "600",
    marginBottom: 16,
  },
  title: {
    color: "#f2f2f0",
    fontSize: 34,
    fontWeight: "500",
    letterSpacing: -1.4,
    lineHeight: 39,
    marginBottom: 24,
  },
  subtitle: {
    color: "#f2f2f0",
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.6,
    marginBottom: 10,
  },
  muted: { fontSize: 13, color: "#9b9b96", lineHeight: 23, marginBottom: 20 },
  small: { fontSize: 11, color: "#8d8d88", lineHeight: 18 },
  button: {
    backgroundColor: brand.primary,
    borderRadius: 6,
    padding: 17,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 51,
    marginVertical: 7,
    borderWidth: 1,
    borderColor: brand.primary,
  },
  buttonText: { color: "#111", fontSize: 12, fontWeight: "600" },
  outline: { backgroundColor: "#141414", borderColor: "#2a2a2a" },
  field: { marginBottom: 20 },
  label: { fontSize: 11, fontWeight: "600", marginBottom: 9, color: "#f2f2f0" },
  input: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 5,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 14,
    color: brand.primary,
    minHeight: 48,
  },
  searchBox: {
    backgroundColor: "#141414",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 20,
    marginTop: -48,
    marginBottom: 35,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 15,
    elevation: 2,
  },
  searchButton: {
    backgroundColor: brand.primary,
    height: 48,
    width: 48,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  category: {
    padding: 17,
    backgroundColor: "#1a1a1a",
    borderRadius: 6,
    marginRight: 10,
    minWidth: 105,
  },
  categoryText: { fontSize: 11, fontWeight: "600", color: "#f2f2f0" },
  card: {
    borderRadius: 9,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "#141414",
    marginBottom: 23,
  },
  cardImage: { width: "100%", height: 210, backgroundColor: "#262626" },
  cardContent: { padding: 20 },
  heart: {
    position: "absolute",
    right: 13,
    top: 13,
    backgroundColor: "#f2f2f0",
    borderRadius: 30,
    width: 35,
    height: 35,
    alignItems: "center",
    justifyContent: "center",
  },
  featured: {
    position: "absolute",
    left: 14,
    top: 15,
    backgroundColor: "#f2f2f0",
    color: "#111",
    fontSize: 8,
    padding: 7,
    letterSpacing: 1,
  },
  inlineFlag: {
    alignSelf: "flex-start",
    backgroundColor: "#f2f2f0",
    color: "#111",
    fontSize: 8,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 5,
    letterSpacing: 1,
    marginBottom: 12,
  },
  price: {
    color: "#f2f2f0",
    fontSize: 27,
    fontWeight: "600",
    letterSpacing: -0.8,
    marginTop: 16,
    marginBottom: 7,
  },
  cardBottom: {
    borderTopWidth: 1,
    borderColor: "#2a2a2a",
    paddingTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#333333",
    borderRadius: 8,
    padding: 26,
    alignItems: "center",
    marginBottom: 25,
    marginTop: 20,
  },
  emptyIcon: { fontSize: 37, color: "#8a8a85", marginBottom: 20 },
  disclaimer: {
    fontSize: 10,
    lineHeight: 18,
    color: "#7d7d78",
    marginVertical: 17,
  },
  promo: {
    backgroundColor: "#101010",
    borderRadius: 8,
    padding: 26,
    marginTop: 20,
  },
  tabBar: {
    borderTopWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "#0d0d0d",
  },
  tabs: { flexDirection: "row", justifyContent: "space-around", height: 64 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  tabText: { fontSize: 8, color: "#7d7d78" },
  tabIcon: { fontSize: 25, color: "#8a8a85", height: 30 },
  compareBar: {
    marginHorizontal: 18,
    marginBottom: 10,
    padding: 15,
    backgroundColor: brand.primary,
    borderRadius: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  modalHeader: {
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: "#2a2a2a",
    minHeight: 65,
  },
  close: { fontSize: 30, fontWeight: "300", color: "#f2f2f0" },
  option: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 22,
    borderBottomWidth: 1,
    borderColor: "#2a2a2a",
  },
  panel: {
    borderWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "#141414",
    padding: 20,
    borderRadius: 7,
    marginVertical: 16,
  },
  error: { backgroundColor: "#2b1512", padding: 20, borderRadius: 6 },
  stepRow: { flexDirection: "row", marginBottom: 27 },
  step: {
    flex: 1,
    fontSize: 9,
    color: "#8a8a85",
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderColor: "#2a2a2a",
  },
  stepActive: {
    color: brand.primary,
    borderBottomWidth: 2,
    borderColor: brand.primary,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginVertical: 20,
  },
  uploadPhoto: { width: "30%", position: "relative" },
  removePhoto: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "#1e1e1e",
    width: 22,
    height: 22,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  check: {
    width: 21,
    height: 21,
    borderWidth: 1,
    borderColor: "#3a3a3a",
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  detailImage: { height: 280, width: "100%", backgroundColor: "#262626" },
  divider: { height: 1, backgroundColor: "#e6e6df", marginVertical: 27 },
  compareRow: {
    borderBottomWidth: 1,
    borderColor: "#2a2a2a",
    paddingVertical: 20,
  },
  accountType: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 6,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#141414",
  },
  accountTypeActive: {
    backgroundColor: brand.primary,
    borderColor: brand.primary,
  },
  accountTypeText: { fontSize: 12, fontWeight: "600", color: "#c8c8c3" },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2e2e2e",
    backgroundColor: "#242424",
  },
  bubbleOwn: {
    alignSelf: "flex-end",
    backgroundColor: "#f2f2ee",
    borderColor: "#f2f2ee",
  },
  bubbleOther: { alignSelf: "flex-start" },
  bubbleSender: {
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#8d8d88",
    marginBottom: 3,
  },
  bubbleText: { fontSize: 14, lineHeight: 20, color: "#f2f2f0" },
  bubbleOwnText: { fontSize: 14, lineHeight: 20, color: "#111" },
  bubbleTime: { fontSize: 10, color: "#8d8d88", marginTop: 4 },
  bubbleOwnTime: { fontSize: 10, color: "#666", marginTop: 4 },
  chatBar: {
    flexShrink: 0,
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: "#2a2a2a",
    alignItems: "flex-end",
  },
  chatInput: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#f2f2f0",
    fontSize: 14,
    minHeight: 42,
    textAlignVertical: "top",
    maxHeight: 100,
  },
  chatSend: {
    backgroundColor: "#f2f2ee",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  chatSendText: { color: "#111", fontWeight: "700", fontSize: 13 },
  toastWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingTop: 12,
    zIndex: 100,
  },
  toast: {
    backgroundColor: "#1c1c1c",
    borderWidth: 1,
    borderColor: "#3a3a3a",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    maxWidth: "88%",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  toastTitle: {
    color: "#f2f2ee",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  toastMessage: { color: "#c8c8c3", fontSize: 13, lineHeight: 18 },
  tabBadge: { color: "#e03131", fontWeight: "700" },
  unreadDot: {
    color: "#e03131",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 8,
  },
});
