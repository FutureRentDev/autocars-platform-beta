import { InstallAppButton } from "./pwa";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Link,
  NavLink,
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Heart,
  SlidersHorizontal,
  Menu,
  X,
  MapPin,
  ArrowLeftRight,
  ChevronRight,
  Search,
  ShieldCheck,
  UserRound,
  Plus,
  CarFront,
  Send,
  MessageCircle,
} from "lucide-react";
import {
  brand,
  money,
  payment,
  type Listing,
  type Filters,
  bodyTypes,
  provinces,
  fuels,
  type ChatMessage,
  type ChatThread,
} from "@autocars/core";
import { api, useApp, useLoad } from "./lib";
export function Logo() {
  return (
    <Link className="logo" to="/" aria-label={`${brand.name} home`}>
      <img src="/logo.png" alt={brand.name} />
    </Link>
  );
}
export function Layout({ children }: { children: ReactNode }) {
  const { user, compare, saved, liveStatus, inbox } = useApp(),
    [open, setOpen] = useState(false);
  return (
    <>
      <div className="announcement">
        <span>One place. Every possibility.</span>
        <span>
          Find your next car. Make your next move. <ArrowUpRight size={12} />
        </span>
      </div>
      <header>
        <div className="nav wrap">
          <Logo />
          <nav className={open ? "open" : ""} onClick={() => setOpen(false)}>
            <NavLink to="/cars">Buy a car</NavLink>
            <NavLink to="/sell">Sell your car</NavLink>
            <NavLink to="/finance">Finance calculator</NavLink>
            <NavLink to="/workspace">
              {user?.role === "admin" ? "Admin workspace" : "My listings"}
            </NavLink>
          </nav>
          <div className="nav-actions">
            <InstallAppButton className="button outline small desktop" />
            <span className={`live-state ${liveStatus}`} role="status">
              {liveStatus === "live" ? "● Live" : "○ Reconnecting"}
            </span>
            <Link
              to="/garage"
              className="icon-link"
              aria-label={`Saved cars, ${saved.length}`}
            >
              <Heart size={20} />
              {saved.length > 0 && <sup>{saved.length}</sup>}
            </Link>
            <Link to="/account" className="account-link">
              <UserRound size={17} />
              <span>{user ? user.name.split(" ")[0] : "Sign in"}</span>
            </Link>
            {user && (
              <Link
                to="/inbox"
                className="icon-link"
                aria-label={`Messages, ${inbox.unread} unread`}
                title="Messages"
              >
                <MessageCircle size={20} />
                {inbox.unread > 0 && (
                  <sup aria-live="polite">
                    {inbox.unread > 99 ? "99+" : inbox.unread}
                  </sup>
                )}
              </Link>
            )}
            <Link to="/sell" className="button small dark desktop">
              Sell my car <Plus size={15} />
            </Link>
            <button
              className="mobile icon-btn"
              aria-label="Toggle navigation"
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer>
        <div className="wrap footer-top">
          <div>
            <Logo />
            <p>A better way to find your next chapter.</p>
          </div>
          <div>
            <Link to="/cars">Find a car</Link>
            <Link to="/sell">Sell your car</Link>
            <Link to="/finance">Finance calculator</Link>
          </div>
          <div>
            <Link to="/garage">My garage</Link>
            <Link to="/workspace">Seller workspace</Link>
            <Link to="/privacy">Privacy & terms</Link>
          </div>
          <p className="footer-note">
            Built for the road ahead.
            <br />
            Made for South Africa.
          </p>
        </div>
        <div className="wrap footer-bottom">
          <span>
            © {new Date().getFullYear()} {brand.name}. All rights reserved.
          </span>
          <span>
            SOUTH AFRICA <span className="sa-dot" />
          </span>
        </div>
      </footer>
      <nav className="bottom-nav mobile">
        <NavLink to="/cars">
          <Search size={20} />
          Explore
        </NavLink>
        <NavLink to="/garage">
          <Heart size={20} />
          Saved
        </NavLink>
        <NavLink to="/sell">
          <Plus size={20} />
          Sell
        </NavLink>
        <NavLink to="/account">
          <UserRound size={20} />
          Account
        </NavLink>
        {user && (
          <NavLink
            to="/inbox"
            className="inbox-nav"
            aria-label={`Messages, ${inbox.unread} unread`}
          >
            <span className="inbox-icon">
              <MessageCircle size={20} />
              {inbox.unread > 0 && (
                <b className="unread-badge">
                  {inbox.unread > 99 ? "99+" : inbox.unread}
                </b>
              )}
            </span>
            Inbox
          </NavLink>
        )}
      </nav>
      {compare.length > 0 && (
        <Link className="compare-float" to="/compare">
          <ArrowLeftRight size={17} /> Compare cars <b>{compare.length}/3</b>
          <ArrowRight size={16} />
        </Link>
      )}
    </>
  );
}
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="eyebrow">
      <span />
      {children}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <CarFront size={30} strokeWidth={1.2} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="error-box">
      {message}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span />
      Finding your next chapter…
    </div>
  );
}
export function CarCard({ car }: { car: Listing }) {
  const { saved, favourite, compare, toggleCompare } = useApp();
  return (
    <article className="car-card">
      <div className="car-photo">
        <Link to={`/cars/${car.id}`}>
          <img
            loading="lazy"
            src={api.image(car.images[0])}
            alt={`${car.year} ${car.make} ${car.model}`}
          />
        </Link>
        {(car.featured || car.greatValue) && (
          <div className="photo-tags">
            {car.featured && <span className="photo-tag">FEATURED</span>}
            {car.greatValue && <span className="value-tag">GREAT VALUE</span>}
          </div>
        )}
        <button
          className={`save-btn ${saved.some((x) => x.id === car.id) ? "selected" : ""}`}
          aria-label="Save car"
          onClick={() => favourite(car)}
        >
          <Heart
            size={17}
            fill={saved.some((x) => x.id === car.id) ? "currentColor" : "none"}
          />
        </button>
        <span className="photo-count">{car.images.length} photos</span>
      </div>
      <div className="car-info">
        <div className="car-year">
          {car.year} · {car.bodyType}
        </div>
        <Link to={`/cars/${car.id}`}>
          <h3>
            {car.make} {car.model}
          </h3>
          <p>{car.variant || `${car.fuel} · ${car.transmission}`}</p>
        </Link>
        <div className="car-price">
          {money(car.price)}
          <span>Est. {money(payment(car.price))}/mo*</span>
        </div>
        <div className="car-specs">
          <span>{car.mileage.toLocaleString()} km</span>
          <i />
          <span>{car.transmission}</span>
          <i />
          <span>{car.fuel}</span>
        </div>
        <div className="card-bottom">
          <span>
            <MapPin size={12} />
            {car.city}
          </span>
          <button className="text-button" onClick={() => toggleCompare(car)}>
            <ArrowLeftRight size={14} />
            {compare.some((x) => x.id === car.id) ? "Added" : "Compare"}
          </button>
        </div>
      </div>
    </article>
  );
}
export function SearchPanel({
  initial = {},
  onSearch,
  compact = false,
}: {
  initial?: Filters;
  onSearch: (f: Filters) => void;
  compact?: boolean;
}) {
  const [f, setF] = useState<Filters>(initial),
    [advanced, setAdvanced] = useState(compact);
  const { data } = useLoad<{ makes: string[]; total: number }>("/facets", {
    makes: [],
    total: 0,
  });
  function field(k: keyof Filters, v: string) {
    setF({ ...f, [k]: v });
  }
  return (
    <form
      className={`search-panel ${compact ? "compact" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(f);
      }}
    >
      {!compact && (
        <div className="search-tabs">
          <b>Find a car</b>
          <Link to="/sell">
            Sell a car <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
      <div className="search-main">
        <label>
          Make or model
          <div className="search-input">
            <Search size={17} />
            <input
              placeholder="What are you looking for?"
              value={f.q || ""}
              onChange={(e) => field("q", e.target.value)}
            />
          </div>
        </label>
        <label>
          Your budget
          <select
            value={f.maxPrice || ""}
            onChange={(e) => field("maxPrice", e.target.value)}
          >
            <option value="">Any price</option>
            {[
              100000, 150000, 200000, 300000, 500000, 750000, 1000000, 2000000,
            ].map((n) => (
              <option key={n} value={n}>
                Up to {money(n)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Location
          <select
            value={f.province || ""}
            onChange={(e) => field("province", e.target.value)}
          >
            <option value="">Anywhere in South Africa</option>
            {provinces.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <button className="button dark search-submit" type="submit">
          <Search size={17} />
          Search cars
          <ArrowUpRight size={16} />
        </button>
      </div>
      <div className="search-meta">
        <span>
          {data.total
            ? `${data.total.toLocaleString()} cars. One perfect match.`
            : "Your next car starts with a search."}
        </span>
        <button
          type="button"
          className="text-button"
          onClick={() => setAdvanced(!advanced)}
        >
          <SlidersHorizontal size={14} />
          {advanced ? "Fewer filters" : "More filters"}
        </button>
      </div>
      {advanced && (
        <div className="advanced-filters">
          {(
            [
              { key: "make", label: "Make", values: data.makes },
              { key: "bodyType", label: "Body type", values: bodyTypes },
              { key: "fuel", label: "Fuel", values: fuels },
              {
                key: "transmission",
                label: "Transmission",
                values: ["Automatic", "Manual"],
              },
            ] as const
          ).map((x) => (
            <label key={x.key}>
              {x.label}
              <select
                value={f[x.key] || ""}
                onChange={(e) => field(x.key, e.target.value)}
              >
                <option value="">Any {x.label.toLowerCase()}</option>
                {x.values.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          ))}
          <label>
            Min price
            <input
              type="number"
              min="0"
              value={f.minPrice || ""}
              placeholder="No minimum"
              onChange={(e) => field("minPrice", e.target.value)}
            />
          </label>
          <label>
            Year from
            <input
              type="number"
              min="1900"
              max={new Date().getFullYear() + 1}
              value={f.minYear || ""}
              placeholder="Any year"
              onChange={(e) => field("minYear", e.target.value)}
            />
          </label>
          <label>
            Maximum km
            <input
              type="number"
              min="0"
              value={f.maxMileage || ""}
              placeholder="Any mileage"
              onChange={(e) => field("maxMileage", e.target.value)}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={f.greatValue === "true"}
              onChange={(e) =>
                field("greatValue", e.target.checked ? "true" : "")
              }
            />
            Great value only
          </label>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setF({});
              onSearch({});
            }}
          >
            Reset filters
          </button>
        </div>
      )}
    </form>
  );
}
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useApp();
  const location = useLocation();
  return loading ? (
    <Loading />
  ) : user ? (
    <>{children}</>
  ) : (
    <div className="wrap page">
      <Empty
        title="A little closer to your next car"
        action={
          <Link
            className="button dark"
            to={`/account?next=${encodeURIComponent(location.pathname + location.search)}`}
          >
            Sign in or create an account <ArrowRight size={17} />
          </Link>
        }
      >
        Sign in to save your favourites, list your car, and manage enquiries.
      </Empty>
    </div>
  );
}
export function SectionHeading({
  label,
  title,
  to,
  link = "View all cars",
}: {
  label: string;
  title: string;
  to?: string;
  link?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        <Eyebrow>{label}</Eyebrow>
        <h2>{title}</h2>
      </div>
      {to && (
        <Link className="text-link" to={to}>
          {link}
          <ArrowUpRight size={18} />
        </Link>
      )}
    </div>
  );
}
export function TrustStrip() {
  return (
    <div className="trust-strip wrap">
      <span>
        <ShieldCheck size={21} />
        Listings reviewed before publishing
      </span>
      <span>
        <ArrowLeftRight size={21} />
        Compare. Decide. Drive.
      </span>
      <span>
        <MapPin size={21} />
        All nine provinces. One destination.
      </span>
    </div>
  );
}
export function ChatModal({
  leadId,
  title,
  onClose,
}: {
  leadId: string;
  title: string;
  onClose: () => void;
}) {
  const { user, notify, subscribeLive } = useApp();
  const [items, setItems] = useState<ChatMessage[]>([]);
  const [vehicle, setVehicle] = useState<ChatThread["vehicle"] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const [viewport, setViewport] = useState(() => ({
    height: window.visualViewport?.height ?? window.innerHeight,
    top: window.visualViewport?.offsetTop ?? 0,
  }));
  function scrollToLatest() {
    const list = messagesRef.current;
    if (list && followLatest.current) list.scrollTop = list.scrollHeight;
  }
  async function load() {
    try {
      const r = await api.get<ChatThread>(`/leads/${leadId}/messages`);
      setItems(r.items);
      setVehicle(r.vehicle);
      setTruncated(r.truncated);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  useEffect(() => {
    followLatest.current = true;
    setItems([]);
    setVehicle(null);
    setDraft("");
    load();
    const off = subscribeLive((t) => {
      if (t.includes("enquiries") || t.includes("account")) load();
    });
    const poll = setInterval(load, 15000);
    return () => {
      off();
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);
  useEffect(scrollToLatest, [items.at(-1)?.id]);
  useEffect(() => {
    const visual = window.visualViewport;
    const resize = () => {
      setViewport({
        height: visual?.height ?? window.innerHeight,
        top: visual?.offsetTop ?? 0,
      });
      requestAnimationFrame(scrollToLatest);
    };
    visual?.addEventListener("resize", resize);
    visual?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    const observer = new ResizeObserver(scrollToLatest);
    if (messagesRef.current) observer.observe(messagesRef.current);
    return () => {
      visual?.removeEventListener("resize", resize);
      visual?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      observer.disconnect();
    };
  }, []);
  async function send() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await api.post(`/leads/${leadId}/messages`, { body });
      followLatest.current = true;
      setDraft("");
      load();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-backdrop chat-backdrop"
      style={{ top: viewport.top, height: viewport.height, bottom: "auto" }}
      onClick={onClose}
    >
      <div
        className="modal chat-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-heading">
          <h2>
            {vehicle ? (
              <Link
                to={`/cars/${vehicle.id}`}
                className="chat-vehicle"
                aria-label={`View listing: ${vehicle.title}`}
              >
                {vehicle.title}
                <small>View vehicle ↗</small>
              </Link>
            ) : (
              title
            )}
          </h2>
          <button
            className="icon-button"
            aria-label="Close chat"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div
          className="chat-messages"
          ref={messagesRef}
          onScroll={(event) => {
            const list = event.currentTarget;
            followLatest.current =
              list.scrollHeight - list.clientHeight - list.scrollTop < 80;
          }}
        >
          {truncated && (
            <p className="fine-print">
              Original enquiry and the latest 500 replies.
            </p>
          )}
          {!items.length && (
            <p className="muted chat-empty">
              No messages yet — say hello to get the conversation started.
            </p>
          )}
          {items.map((m) => (
            <div
              key={m.id}
              className={`chat-bubble ${m.senderId === user?.id ? "own" : ""}`}
            >
              {m.senderId !== user?.id && (
                <span className="chat-sender">{m.senderName}</span>
              )}
              <p>{m.body}</p>
              <time>
                {new Date(m.createdAt).toLocaleTimeString("en-ZA", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          ))}
        </div>
        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a message…"
            maxLength={2000}
            aria-label="Message"
            onFocus={() => {
              followLatest.current = true;
              requestAnimationFrame(scrollToLatest);
            }}
          />
          <button
            className="button dark small"
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="Send message"
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}

export function NotificationChat() {
  const { leadId } = useParams();
  const navigate = useNavigate();
  return (
    <RequireAuth>
      <div className="wrap page">
        <h1>Your conversation.</h1>
        {leadId && (
          <ChatModal
            key={leadId}
            leadId={leadId}
            title="Conversation"
            onClose={() => navigate("/inbox")}
          />
        )}
      </div>
    </RequireAuth>
  );
}

export function InboxPage() {
  const { inbox } = useApp();
  return (
    <RequireAuth>
      <div className="wrap page">
        <Eyebrow>KEEP THE CONVERSATION MOVING</Eyebrow>
        <h1>Your messages.</h1>
        {inbox.items.length ? (
          <div className="lead-list">
            {inbox.items.map(
              (thread: {
                id: string;
                title: string;
                preview: string;
                unread: number;
                updatedAt: string;
              }) => (
                <Link
                  className="inbox-thread"
                  key={thread.id}
                  to={`/chat/${thread.id}`}
                >
                  <div>
                    <b>{thread.title}</b>
                    <p>{thread.preview}</p>
                    <small>
                      {new Date(thread.updatedAt).toLocaleString("en-ZA")}
                    </small>
                  </div>
                  {thread.unread > 0 && (
                    <span className="thread-count">{thread.unread} unread</span>
                  )}
                  <ArrowRight size={18} />
                </Link>
              ),
            )}
          </div>
        ) : (
          <Empty title="Your conversations start here.">
            Enquiries and messages will appear here.
          </Empty>
        )}
      </div>
    </RequireAuth>
  );
}
