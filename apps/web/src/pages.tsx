import { InstallAppButton } from "./pwa";
import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowLeft,
  Heart,
  MapPin,
  ShieldCheck,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  CarFront,
  Fuel,
  Gauge,
  Settings2,
  Check,
  Bookmark,
  Download,
  Smartphone,
} from "lucide-react";
import {
  brand,
  money,
  payment,
  bodyTypes,
  vehicleHighlights,
  vehicleDetailGroups,
  type Listing,
  type SavedSearch,
  type Filters,
  type Enquiry,
} from "@autocars/core";
import { api, useApp, useLoad } from "./lib";
import {
  Eyebrow,
  SearchPanel,
  TrustStrip,
  SectionHeading,
  CarCard,
  Empty,
  ErrorBox,
  Loading,
  RequireAuth,
  ChatModal,
} from "./components";
export function Home() {
  const navigate = useNavigate();
  const { data, error, loading } = useLoad<{ items: Listing[]; total: number }>(
    "/listings",
    { items: [], total: 0 },
    ["catalogue"],
  );
  return (
    <>
      <section className="hero">
        <div className="hero-image" />
        <div className="hero-shade" />
        <div className="wrap hero-content">
          <Eyebrow>THE ROAD IS YOURS</Eyebrow>
          <h1>
            Your next car.
            <br />
            Your next <em>chapter.</em>
          </h1>
          <p>
            From everyday drives to once-in-a-lifetime finds.
            <br />
            Discover a car that moves you.
          </p>
          <div className="hero-caption">
            <span>LESS SEARCHING. MORE LIVING.</span>
            <span>
              01 — THE OPEN ROAD <ArrowUpRight size={16} />
            </span>
          </div>
        </div>
      </section>
      <div className="wrap search-wrap">
        <SearchPanel
          onSearch={(f) =>
            navigate(
              `/cars?${new URLSearchParams(Object.entries(f).filter(([, v]) => v))}`,
            )
          }
        />
      </div>
      <TrustStrip />
      <section className="wrap section">
        <SectionHeading
          label="FIND YOUR KIND OF DRIVE"
          title="A car for every version of you."
        />
        <div className="body-grid">
          {[
            {
              name: "SUV",
              sub: "Room for more",
              path: "M9 34h76l-7-17H30L19 27H9z",
            },
            {
              name: "Hatchback",
              sub: "Made for the everyday",
              path: "M9 34h76l-7-16H40L25 27H9z",
            },
            {
              name: "Sedan",
              sub: "Arrive a little differently",
              path: "M7 34h80v-9H68L57 17H34L21 26H7z",
            },
            {
              name: "Bakkie",
              sub: "Ready for the long way",
              path: "M8 34h80V22H59V11H36L24 26H8z",
            },
            {
              name: "Coupé",
              sub: "For the love of driving",
              path: "M7 34h81v-9H68L52 16H36L20 26H7z",
            },
            {
              name: "Electric",
              sub: "A new kind of energy",
              path: "M8 34h79l-5-10H68L56 15H34L23 25H8z",
            },
          ].map((c) => (
            <Link
              className="body-card"
              key={c.name}
              to={`/cars?${c.name === "Electric" ? "fuel=Electric" : `bodyType=${encodeURIComponent(c.name)}`}`}
            >
              <div className="body-top">
                <span>{c.name}</span>
                <ArrowUpRight size={16} />
              </div>
              <svg viewBox="0 0 96 50" aria-hidden="true">
                <path d={c.path} />
                <circle cx="25" cy="35" r="8" />
                <circle cx="72" cy="35" r="8" />
                <circle className="wheel" cx="25" cy="35" r="4" />
                <circle className="wheel" cx="72" cy="35" r="4" />
              </svg>
              <small>{c.sub}</small>
            </Link>
          ))}
        </div>
      </section>
      <section className="inventory-section">
        <div className="wrap section">
          <SectionHeading
            label="YOUR NEXT CHAPTER IS WAITING"
            title="Find something that feels like you."
            to="/cars"
          />
          {loading ? (
            <Loading />
          ) : error ? (
            <ErrorBox message={error} />
          ) : data.items.length ? (
            <div className="car-grid">
              {data.items.slice(0, 3).map((car) => (
                <CarCard key={car.id} car={car} />
              ))}
            </div>
          ) : (
            <Empty
              title="The road is open."
              action={
                <Link className="button dark" to="/sell">
                  Be the first to list a car <ArrowUpRight size={16} />
                </Link>
              }
            >
              New cars will appear here once sellers submit them and our team
              reviews them. Have a car to sell? Start its next chapter.
            </Empty>
          )}
          <p className="fine-print">
            *Finance estimates are illustrative. Adjust the rate, deposit and
            term in the calculator.
          </p>
        </div>
      </section>
      <section className="wrap section split-promo">
        <div className="sell-promo">
          <Eyebrow>TIME FOR SOMETHING NEW?</Eyebrow>
          <h2>
            Good cars deserve
            <br />a great next chapter.
          </h2>
          <p>
            A simple listing. A new audience.
            <br />A better way to sell your car.
          </p>
          <Link to="/sell" className="button light">
            Let’s sell your car <ArrowUpRight size={18} />
          </Link>
          <div className="promo-lines" aria-hidden="true">
            ///
          </div>
        </div>
        <div className="finance-promo">
          <Eyebrow>START WITH YOUR BUDGET</Eyebrow>
          <h2>
            Dream big.
            <br />
            Know your numbers.
          </h2>
          <p>
            Explore monthly repayments before you
            <br />
            fall in love with your next car.
          </p>
          <Link to="/finance" className="text-link">
            Find your budget <ArrowUpRight size={19} />
          </Link>
          <span className="finance-number">
            R <b>?</b>
            <span>/ month</span>
          </span>
        </div>
      </section>
      <section className="wrap app-banner">
        <div className="app-icon">A</div>
        <div>
          <Eyebrow>GO WHERE LIFE TAKES YOU</Eyebrow>
          <h3>Your car search. In your pocket.</h3>
          <p>
            Install {brand.name} from your browser for quick access, wherever
            you are.
          </p>
        </div>
        <InstallAppButton className="button outline" />
        <div id="install-help" popover="auto" className="install-popover">
          <h3>Take {brand.name} with you</h3>
          <p>
            On iPhone: open this website in Safari, tap Share, then Add to Home
            Screen.
          </p>
          <p>
            On Android: open in Chrome, tap the menu, then Install app or Add to
            Home screen.
          </p>
          <p>
            The installed app needs a connection to show live cars and manage
            your account.
          </p>
          <button
            className="button dark"
            popoverTarget="install-help"
            popoverTargetAction="hide"
          >
            Got it
          </button>
        </div>
      </section>
    </>
  );
}
export function Browse() {
  const [params, setParams] = useSearchParams(),
    { notify, user } = useApp();
  const { data, error, loading } = useLoad<{
    items: Listing[];
    total: number;
    page: number;
    pages: number;
  }>(`/listings?${params}`, { items: [], total: 0, page: 1, pages: 0 }, [
    "catalogue",
  ]);
  const f = Object.fromEntries(params) as Filters;
  function search(next: Filters) {
    setParams(
      Object.fromEntries(
        Object.entries(next).filter(([, v]) => v && v !== undefined),
      ) as Record<string, string>,
    );
  }
  return (
    <div className="wrap page">
      <div className="page-heading">
        <Eyebrow>FIND YOUR NEXT CHAPTER</Eyebrow>
        <h1>
          Good things are just
          <br />a drive away.
        </h1>
      </div>
      <SearchPanel
        key={params.toString()}
        initial={f}
        compact
        onSearch={search}
      />
      <div className="results-toolbar">
        <div>
          <h2>
            {loading
              ? "Searching…"
              : `${data.total.toLocaleString()} cars to explore`}
          </h2>
          <p>Your road. Your rules. Your next car.</p>
        </div>
        <div className="toolbar-actions">
          <button
            className="button outline small"
            onClick={async () => {
              if (!user) {
                notify("Sign in to save this search.");
                return;
              }
              try {
                await api.post("/me/searches", {
                  name: f.q || f.bodyType || "My car search",
                  filters: f,
                });
                notify("Search saved to your garage.");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <Bookmark size={15} />
            Save search
          </button>
          <label className="sort-label">
            <span className="sr-only">Sort cars</span>
            <select
              value={f.sort || "newest"}
              onChange={(e) =>
                search({ ...f, sort: e.target.value, page: "1" })
              }
            >
              <option value="newest">Recently added</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="mileage">Lowest mileage</option>
              <option value="year">Newest year</option>
            </select>
          </label>
        </div>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} />
      ) : data.items.length ? (
        <>
          <div className="car-grid">
            {data.items.map((car) => (
              <CarCard key={car.id} car={car} />
            ))}
          </div>
          {data.pages > 1 && (
            <div className="pagination">
              <button
                disabled={data.page <= 1}
                className="button outline"
                onClick={() => search({ ...f, page: String(data.page - 1) })}
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <span>
                {data.page} / {data.pages}
              </span>
              <button
                disabled={data.page >= data.pages}
                className="button outline"
                onClick={() => search({ ...f, page: String(data.page + 1) })}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      ) : (
        <Empty
          title="Your perfect match is still out there."
          action={
            <button className="button dark" onClick={() => setParams({})}>
              Explore all cars <ArrowRight size={16} />
            </button>
          }
        >
          Try a wider budget, another province, or fewer filters. New listings
          appear after review.
        </Empty>
      )}
    </div>
  );
}
export function Detail() {
  const { id } = useParams();
  const { user, notify, favourite, saved, toggleCompare } = useApp();
  const { data, error, loading } = useLoad<{ listing: Listing | null }>(
    `/listings/${id}`,
    { listing: null },
    ["catalogue", "account"],
  );
  const [index, setIndex] = useState(0),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false);
  if (loading) return <Loading />;
  if (error || !data.listing)
    return (
      <div className="wrap page">
        <ErrorBox message={error || "Vehicle not found."} />
      </div>
    );
  const car = data.listing;
  async function enquire(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = Object.fromEntries(new FormData(e.currentTarget));
      await api.post(`/listings/${id}/enquire`, {
        ...f,
        consent: f.consent === "on",
      });
      setSent(true);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="wrap page">
      <Link to="/cars" className="text-link">
        <ArrowLeft size={16} />
        Back to cars
      </Link>
      <div className="detail-layout">
        <div>
          <div className="gallery">
            <img
              src={api.image(car.images[index] || car.images[0])}
              alt={`${car.make} ${car.model} photo ${index + 1}`}
            />
            {car.images.length > 1 && (
              <>
                <button
                  className="gallery-prev"
                  aria-label="Previous photo"
                  onClick={() =>
                    setIndex(
                      (index - 1 + car.images.length) % car.images.length,
                    )
                  }
                >
                  <ChevronLeft />
                </button>
                <button
                  className="gallery-next"
                  aria-label="Next photo"
                  onClick={() => setIndex((index + 1) % car.images.length)}
                >
                  <ChevronRight />
                </button>
              </>
            )}
            <span>
              {index + 1} / {car.images.length}
            </span>
          </div>
          <div className="thumbnails">
            {car.images.map((src, i) => (
              <button
                className={i === index ? "active" : ""}
                key={src}
                onClick={() => setIndex(i)}
              >
                <img src={api.image(src)} alt={`View photo ${i + 1}`} />
              </button>
            ))}
          </div>
          <div className="detail-title">
            <div>
              <Eyebrow>
                {car.year} · {car.bodyType}
              </Eyebrow>
              <h1>
                {car.make} {car.model}
              </h1>
              {car.greatValue && (
                <span className="value-tag detail-flag">GREAT VALUE</span>
              )}
              <p>{car.variant}</p>
            </div>
            <button
              className="icon-btn"
              aria-label="Save car"
              onClick={() => favourite(car)}
            >
              <Heart
                fill={
                  saved.some((x) => x.id === car.id) ? "currentColor" : "none"
                }
              />
            </button>
          </div>
          <div className="vehicle-pills" aria-label="Vehicle highlights">
            {vehicleHighlights(car).map((value) => (
              <span key={value} className="vehicle-pill">
                {value}
              </span>
            ))}
          </div>
          <section
            className="vehicle-specification"
            aria-label="Vehicle details"
          >
            <h2>Vehicle details</h2>
            {vehicleDetailGroups(car).map((group) => (
              <section key={group.title} className="vehicle-spec-group">
                <h3>{group.title}</h3>
                <dl>
                  {group.items.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </section>
          <h3>Meet your next car.</h3>
          <p className="description">{car.description}</p>
          <button className="button outline" onClick={() => toggleCompare(car)}>
            <ArrowLeftRight size={16} />
            Add to comparison
          </button>
          <div className="safety-note">
            <ShieldCheck size={24} />
            <div>
              <b>A little care goes a long way.</b>
              <p>
                View the vehicle in person. Check ownership and service history.
                Never pay a deposit before verifying the seller. Listing review
                is not a mechanical inspection or a guarantee.
              </p>
            </div>
          </div>
        </div>
        <aside className="detail-sidebar">
          <div className="price-panel">
            <Eyebrow>YOUR NEXT MOVE</Eyebrow>
            <h2>{money(car.price)}</h2>
            <p>Est. {money(payment(car.price))}/month*</p>
            <Link to={`/finance?price=${car.price}`}>
              Make the numbers work for you <ArrowUpRight size={14} />
            </Link>
            <hr />
            <h3>Let’s talk about this car.</h3>
            <p>Enquire directly with {car.sellerName}.</p>
            {car.status !== "published" ? (
              <p className="status">This listing is {car.status}.</p>
            ) : !user ? (
              <Link
                to={`/account?next=/cars/${car.id}`}
                className="button dark full"
              >
                Sign in to enquire <ArrowRight size={16} />
              </Link>
            ) : sent ? (
              <div className="success-panel">
                <Check />
                <h3>You’ve made the first move.</h3>
                <p>
                  Your enquiry is in the seller’s workspace. They can use your
                  contact details to get back to you.
                </p>
              </div>
            ) : (
              <form onSubmit={enquire} className="form-stack">
                <label>
                  Your name
                  <input name="name" required defaultValue={user.name} />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    name="email"
                    required
                    defaultValue={user.email}
                  />
                </label>
                <label>
                  Phone number
                  <input
                    type="tel"
                    name="phone"
                    required
                    placeholder="e.g. 082 123 4567"
                    pattern="[+0-9 ()-]{9,20}"
                  />
                </label>
                <label>
                  Message
                  <textarea
                    name="message"
                    minLength={10}
                    maxLength={2000}
                    required
                    defaultValue={`Hi, I'm interested in your ${car.year} ${car.make} ${car.model}. Is it still available?`}
                  />
                </label>
                <label className="checkbox">
                  <input name="consent" type="checkbox" required />I agree to
                  share my contact details with this seller for this enquiry.
                </label>
                <button disabled={busy} className="button dark full">
                  {busy ? "Sending…" : "Send enquiry"}
                  <ArrowUpRight size={16} />
                </button>
              </form>
            )}
            <p className="fine-print">
              *Illustrative estimate at 11.75% over 72 months with no deposit or
              balloon. Excludes fees. Actual offers depend on the lender.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
export function Finance() {
  const [params] = useSearchParams(),
    requestedPrice = Number(params.get("price")),
    [price, setPrice] = useState(
      requestedPrice > 0 ? String(requestedPrice) : "350000",
    ),
    [deposit, setDeposit] = useState("35000"),
    [rate, setRate] = useState("11.75"),
    [months, setMonths] = useState(72),
    [balloon, setBalloon] = useState("0");
  const numeric = (value: string) => {
      const n = Number(value);
      return value.trim() !== "" && Number.isFinite(n) ? n : null;
    },
    bounded = (value: string, min: number, max: number) => {
      const n = numeric(value);
      return n !== null && n >= min && n <= max ? n : null;
    },
    optional = (value: string, min: number, max: number) =>
      value.trim() === "" ? 0 : bounded(value, min, max),
    p = bounded(price, 1000, 100000000),
    d = p === null ? null : optional(deposit, 0, p),
    r = bounded(rate, 0, 40),
    b = optional(balloon, 0, 35),
    result =
      p !== null && d !== null && r !== null && b !== null
        ? (() => {
            const amount = payment(p, d, r, months, b),
              total = amount * months + (p * b) / 100 + d;
            return {
              amount,
              financed: Math.max(0, p - d),
              balloon: (p * b) / 100,
              interest: Math.max(0, total - p),
              total,
            };
          })()
        : null;
  return (
    <div className="wrap page">
      <Eyebrow>KNOW YOUR NUMBERS</Eyebrow>
      <h1>
        A clearer road
        <br />
        to your next car.
      </h1>
      <p className="lead">
        Play with the possibilities. Find a monthly payment that fits your life.
      </p>
      <div className="finance-layout">
        <form className="panel form-stack" onSubmit={(e) => e.preventDefault()}>
          {[
            {
              label: "Vehicle price",
              value: price,
              set: setPrice,
              min: 1000,
              max: 100000000,
              step: 1000,
              prefix: "R",
            },
            {
              label: "Deposit",
              value: deposit,
              set: setDeposit,
              min: 0,
              max: p ?? 100000000,
              step: 1000,
              prefix: "R",
            },
            {
              label: "Interest rate per year",
              value: rate,
              set: setRate,
              min: 0,
              max: 40,
              step: 0.25,
              prefix: "%",
            },
            {
              label: "Balloon payment",
              value: balloon,
              set: setBalloon,
              min: 0,
              max: 35,
              step: 1,
              prefix: "%",
            },
          ].map((x) => (
            <label key={x.label}>
              {x.label}
              <div className="number-input">
                <span>{x.prefix}</span>
                <input
                  type="number"
                  value={x.value}
                  min={x.min}
                  max={x.max}
                  step={x.step}
                  onChange={(e) => x.set(e.target.value)}
                />
              </div>
              <input
                aria-label={`${x.label} slider`}
                type="range"
                min={x.min}
                max={x.max > 1000000 ? 1500000 : x.max}
                step={x.step}
                value={Math.min(
                  Math.max(numeric(x.value) ?? x.min, x.min),
                  x.max > 1000000 ? 1500000 : x.max,
                )}
                onChange={(e) => x.set(String(Number(e.target.value)))}
              />
            </label>
          ))}
          <label>
            Loan term
            <select
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
            >
              {[12, 24, 36, 48, 60, 72, 84].map((n) => (
                <option key={n} value={n}>
                  {n} months
                </option>
              ))}
            </select>
          </label>
        </form>
        <div className="finance-result">
          <Eyebrow>YOUR ESTIMATED MONTHLY PAYMENT</Eyebrow>
          <h2>
            {result ? money(result.amount) : "—"}
            <small>/ month</small>
          </h2>
          <div>
            <span>Amount financed</span>
            <b>{result ? money(result.financed) : "—"}</b>
          </div>
          <div>
            <span>Final balloon payment</span>
            <b>{result ? money(result.balloon) : "—"}</b>
          </div>
          <div>
            <span>Total interest</span>
            <b>{result ? money(result.interest) : "—"}</b>
          </div>
          <div>
            <span>Total paid, including deposit</span>
            <b>{result ? money(result.total) : "—"}</b>
          </div>
          {result && p !== null && (
            <Link className="button light full" to={`/cars?maxPrice=${p}`}>
              Find cars in this budget <ArrowUpRight size={18} />
            </Link>
          )}
          <p>
            This calculation is an estimate, not a finance offer or financial
            advice. It excludes initiation fees, monthly service fees, insurance
            and other charges. A balloon leaves a final amount payable at the
            end. Confirm all costs with your lender.
          </p>
        </div>
      </div>
    </div>
  );
}
export function Compare() {
  const { compare, toggleCompare } = useApp();
  return (
    <div className="wrap page">
      <Eyebrow>THE DETAILS MAKE THE DIFFERENCE</Eyebrow>
      <h1>
        A little perspective.
        <br />A better decision.
      </h1>
      {compare.length ? (
        <div className="comparison">
          {compare.map((c) => (
            <div className="compare-column" key={c.id}>
              <img src={api.image(c.images[0])} alt={`${c.make} ${c.model}`} />
              <Link to={`/cars/${c.id}`}>
                <h3>
                  {c.year} {c.make} {c.model}
                </h3>
              </Link>
              {[
                ["Price", money(c.price)],
                ["Mileage", `${c.mileage.toLocaleString()} km`],
                ["Body type", c.bodyType],
                ["Transmission", c.transmission],
                ["Fuel", c.fuel],
                ["Location", c.city],
                ["Est. monthly*", money(payment(c.price))],
              ].map(([k, v]) => (
                <div className="compare-row" key={k}>
                  <small>{k}</small>
                  <b>{v}</b>
                </div>
              ))}
              <button
                className="button outline full"
                onClick={() => toggleCompare(c)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="Good choices start with a comparison."
          action={
            <Link to="/cars" className="button dark">
              Explore cars <ArrowRight size={16} />
            </Link>
          }
        >
          Choose up to three cars using the Compare button on a listing.
        </Empty>
      )}
      <p className="fine-print">
        *Illustrative repayments at 11.75% over 72 months, no deposit or
        balloon, excluding fees. Listing availability may change; open each
        listing for its current status.
      </p>
    </div>
  );
}
export function Garage() {
  return (
    <RequireAuth>
      <GarageContent />
    </RequireAuth>
  );
}
function GarageContent() {
  const { saved, notify, subscribeLive } = useApp();
  const [chat, setChat] = useState<string | null>(null);
  const { data, reload, error } = useLoad<{ items: SavedSearch[] }>(
    "/me/searches",
    { items: [] },
    ["account"],
  );
  const { data: enquiries, reload: reloadEnquiries } = useLoad<{
    items: Enquiry[];
  }>("/me/enquiries", { items: [] }, ["enquiries", "account"]);
  useEffect(() => subscribeLive(() => reloadEnquiries()), [reloadEnquiries]);
  return (
    <div className="wrap page">
      <Eyebrow>YOUR OWN CORNER OF THE ROAD</Eyebrow>
      <h1>My garage.</h1>
      <SectionHeading
        label="THE ONES THAT CAUGHT YOUR EYE"
        title="Saved cars"
      />
      {saved.length ? (
        <div className="car-grid">
          {saved.map((c) => (
            <CarCard key={c.id} car={c} />
          ))}
        </div>
      ) : (
        <Empty
          title="Keep the good ones close."
          action={
            <Link className="button dark" to="/cars">
              Find a favourite <Heart size={16} />
            </Link>
          }
        >
          Tap the heart on any car to save it here.
        </Empty>
      )}
      <SectionHeading label="CONVERSATIONS ON THE GO" title="My enquiries" />
      {enquiries.items.length ? (
        <div className="lead-list">
          {enquiries.items.map((e) => (
            <div
              className="panel"
              key={e.id}
              style={{ cursor: "pointer" }}
              onClick={() => setChat(e.id)}
            >
              <div className="lead-header">
                <div>
                  <h3>
                    {e.year} {e.make} {e.model}
                    {!!e.unread && (
                      <span
                        className="status pending"
                        style={{ marginLeft: 8 }}
                      >
                        {e.unread} new
                      </span>
                    )}
                  </h3>
                  <p>
                    Enquiry sent{" "}
                    {new Date(e.createdAt).toLocaleDateString("en-ZA")}
                  </p>
                </div>
                <span
                  className={`status ${e.status === "new" ? "pending" : ""}`}
                >
                  {e.status}
                </span>
              </div>
              <p className="description">{e.message}</p>
              <div className="button-row">
                <button
                  className="button dark small"
                  onClick={() => setChat(e.id)}
                >
                  Message seller
                </button>
                <Link
                  className="button outline small"
                  to={`/cars/${e.listingId}`}
                >
                  View car <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">
          Enquiries you send from a vehicle page will appear here with live
          replies from the seller.
        </p>
      )}
      <SectionHeading
        label="PICK UP WHERE YOU LEFT OFF"
        title="Saved searches"
      />
      {error && <ErrorBox message={error} />}
      <div className="saved-searches">
        {data.items.map((s) => (
          <div className="saved-search" key={s.id}>
            <Bookmark size={22} />
            <div>
              <h3>{s.name}</h3>
              <p>
                {Object.entries(s.filters)
                  .filter(([k, v]) => v && k !== "page")
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ") || "All cars"}
              </p>
            </div>
            <Link
              className="button outline small"
              to={`/cars?${new URLSearchParams(s.filters as Record<string, string>)}`}
            >
              Search <ArrowUpRight size={14} />
            </Link>
            <button
              aria-label="Delete saved search"
              className="text-button"
              onClick={async () => {
                try {
                  await api.delete(`/me/searches/${s.id}`);
                  reload();
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      {!data.items.length && (
        <p className="muted">
          Save a search from the results page to return to it here. Saved
          searches do not currently send alerts.
        </p>
      )}
      {chat && (
        <ChatModal
          leadId={chat}
          title={
            enquiries.items.find((e) => e.id === chat)
              ? `${enquiries.items.find((e) => e.id === chat)!.year} ${enquiries.items.find((e) => e.id === chat)!.make} ${enquiries.items.find((e) => e.id === chat)!.model}`
              : "Conversation"
          }
          onClose={() => {
            setChat(null);
            reloadEnquiries();
          }}
        />
      )}
    </div>
  );
}
export function Legal() {
  return (
    <div className="wrap page prose">
      <Eyebrow>CLARITY MATTERS</Eyebrow>
      <h1>Privacy & marketplace terms.</h1>
      <p>
        Effective {new Date().getFullYear()}. These operational terms describe
        the current platform. The business operator must add its legal entity,
        contact details and applicable policies before public launch.
      </p>
      <h2>Your information</h2>
      <p>
        We store your account name, email, password hash, saved cars, searches,
        listing photos, listing details and enquiry details. Session tokens are
        stored as hashes on the server. Web sessions use an essential HTTP-only
        cookie. We do not use advertising cookies or third-party analytics in
        this application.
      </p>
      <h2>What is public</h2>
      <p>
        Published listings show the vehicle, photos, seller name, location and
        asking price. Do not put personal documents, identity numbers, bank
        details or addresses in photos or descriptions. Photos are re-encoded to
        remove metadata. Contact information submitted with an enquiry is shared
        with the seller.
      </p>
      <h2>Your choices</h2>
      <p>
        You can edit your profile or delete your account from the Account page.
        Deleting an account removes its profile photo, listings, uploads,
        sessions, favourites and saved searches. Enquiries you sent to other
        sellers remain with those sellers but are detached from your account;
        request removal from the operator if needed. Operational backups have
        their own retention schedule, which the operator must publish.
      </p>
      <h2>Buying & selling</h2>
      <p>
        {brand.name} connects buyers and sellers. The platform does not take
        payment for vehicles or provide escrow. Sellers are responsible for
        accurate descriptions, rights to photos and lawful ownership. Listings
        are reviewed before publication, but this does not guarantee vehicle
        condition or seller identity. Inspect the car, verify documentation and
        use secure payment methods.
      </p>
      <h2>Finance</h2>
      <p>
        Repayment calculations are illustrative estimates. The platform does not
        approve finance, provide a credit decision or make binding offers.
      </p>
      <h2>Contact & legal details</h2>
      <p>
        {brand.supportEmail
          ? `Contact: ${brand.supportEmail}`
          : "Operator contact details have not yet been configured."}{" "}
        Before release, the operator must complete its legal entity details,
        privacy contact, retention policy, complaints procedure, and applicable
        South African legal documents.
      </p>
    </div>
  );
}
