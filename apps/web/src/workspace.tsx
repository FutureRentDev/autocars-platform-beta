import { startHostedCheckout } from "./checkout";
import { NotificationsPanel, disableWebPush } from "./pwa";
import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Plus,
  Upload,
  X,
  CarFront,
  Users,
  Inbox,
  ShieldCheck,
  LayoutDashboard,
  Clock,
  Download,
  LogOut,
  Building2,
} from "lucide-react";
import {
  bodyTypes,
  fuels,
  provinces,
  money,
  brand,
  canSell,
  requiresAdFee,
  type Listing,
  type Lead,
  type BusinessApplication,
  type BusinessStatus,
} from "@autocars/core";
import { api, useApp, useLoad, useLiveUpdate } from "./lib";
import {
  Eyebrow,
  Empty,
  ErrorBox,
  Loading,
  RequireAuth,
  ChatModal,
} from "./components";
const emptyBusiness = {
  businessName: "",
  registrationNumber: "",
  contactName: "",
  phone: "",
  province: "Gauteng",
  city: "",
  website: "",
  message: "",
};
export function Account() {
  const { user, loading, refresh, notify } = useApp();
  const [params, setParams] = useSearchParams(),
    [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">(
      params.get("reset") ? "reset" : "login",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    [accountType, setAccountType] = useState<"customer" | "business">(
      "customer",
    ),
    [biz, setBiz] = useState({ ...emptyBusiness }),
    [bizConsent, setBizConsent] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const token = params.get("verify");
    if (token) {
      api
        .post("/auth/verify", { token })
        .then(() => {
          notify("Email verified.");
          refresh();
          setParams({});
        })
        .catch((e) => {
          setError(e.message);
          setParams({});
        });
    }
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const b = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (mode === "forgot") {
        await api.post("/auth/forgot", b);
        notify("If an account exists, a recovery link is on its way.");
      } else if (mode === "reset") {
        await api.post("/auth/reset", {
          password: b.password,
          token: params.get("reset"),
        });
        notify("Password updated. Sign in with your new password.");
        setMode("login");
        setParams({});
      } else {
        const payload: Record<string, unknown> = {
          ...b,
          consent: b.consent === "on",
        };
        if (mode === "register") {
          payload.accountType = accountType;
          if (accountType === "business") {
            if (!bizConsent) {
              setError(
                "Please confirm that AutoCars may contact you about your business application.",
              );
              setBusy(false);
              return;
            }
            payload.business = { ...biz, contactConsent: true };
          }
        }
        await api.post(`/auth/${mode}`, payload);
        await refresh();
        const next = params.get("next");
        navigate(
          next?.startsWith("/") && !next.startsWith("//") ? next : "/garage",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (user)
    return (
      <div className="wrap page account-page">
        <Eyebrow>YOU'RE IN THE DRIVER'S SEAT</Eyebrow>
        <h1>Hello, {user.name.split(" ")[0]}.</h1>
        <p className="lead">Your profile, your listings, your next chapter.</p>

        {error && <ErrorBox message={error} />}
        <div className="panel">
          <h3>{user.name}</h3>
          <p>{user.email}</p>
          <p className="status">
            {user.verified ? "Email verified" : "Email not verified"}
          </p>
          <p className="status">
            {user.accountType === "business"
              ? `Business account · ${user.businessStatus === "active" ? "selling activated" : user.businessStatus ? `application ${user.businessStatus}` : "no application yet"}`
              : "Personal account"}
          </p>
          {!user.verified && (
            <button
              className="button outline"
              onClick={async () => {
                try {
                  await api.post("/auth/verify/send");
                  notify("Verification email sent.");
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              Send verification email
            </button>
          )}
          <div className="button-row">
            <Link className="button dark" to="/garage">
              My garage <ArrowUpRight size={16} />
            </Link>
            <Link className="button outline" to="/workspace">
              My workspace <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
        <NotificationsPanel />
        <div className="panel">
          <h3>Your data belongs to you.</h3>
          <p>Download your account information or remove your account.</p>
          <div className="button-row">
            <button
              className="button outline"
              onClick={async () => {
                try {
                  const data = await api.get("/me/export");
                  const u = URL.createObjectURL(
                    new Blob([JSON.stringify(data, null, 2)], {
                      type: "application/json",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = u;
                  a.download = `${brand.slug}-account.json`;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(u), 1000);
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              <Download size={16} />
              Export my data
            </button>
            <button
              className="button outline"
              onClick={async () => {
                try {
                  await disableWebPush();
                  await api.post("/auth/logout");
                  await refresh();
                  notify("Signed out.");
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              <LogOut size={16} />
              Sign out
            </button>
            {user.role !== "admin" && (
              <button
                className="text-button danger"
                onClick={() => setConfirmDelete(!confirmDelete)}
              >
                Delete account
              </button>
            )}
          </div>
          {confirmDelete && (
            <form
              className="form-stack delete-confirm"
              onSubmit={async (e) => {
                e.preventDefault();
                const password = new FormData(e.currentTarget).get("password");
                try {
                  await api.request("/me", {
                    method: "DELETE",
                    body: JSON.stringify({ password }),
                  });
                  await refresh();
                  notify("Your account has been deleted.");
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              <p>
                This removes your account, listings and uploaded photos.
                Enquiries sent to other sellers remain in their records. This
                action cannot be undone.
              </p>
              <label>
                Confirm with your password
                <input type="password" name="password" required />
              </label>
              <button className="button danger-bg">
                Permanently delete account
              </button>
            </form>
          )}
        </div>
      </div>
    );
  return (
    <div className="auth-layout">
      <div className="auth-visual">
        <Eyebrow>YOUR NEXT CHAPTER</Eyebrow>
        <h1>
          A great drive
          <br />
          starts with
          <br />
          <em>a connection.</em>
        </h1>
        <p>
          Save the possibilities.
          <br />
          Find the one. Make your move.
        </p>
      </div>
      <div className="auth-form">
        <Eyebrow>WELCOME TO {brand.name.toUpperCase()}</Eyebrow>
        <h2>
          {mode === "register"
            ? "Let’s get you on the road."
            : mode === "forgot"
              ? "Find your way back."
              : mode === "reset"
                ? "A fresh start."
                : "Good to see you."}
        </h2>
        <p>
          {mode === "register"
            ? "Create an account. Your next chapter is waiting."
            : "Your next car is a little closer."}
        </p>
        {error && <ErrorBox message={error} />}
        <form className="form-stack" onSubmit={submit}>
          {mode === "register" && (
            <>
              <label>
                Your name
                <input
                  name="name"
                  minLength={2}
                  maxLength={100}
                  required
                  autoComplete="name"
                />
              </label>
              <div className="account-type">
                <span>I am joining as</span>
                <div className="button-row">
                  <button
                    type="button"
                    className={`button small ${accountType === "customer" ? "dark" : "outline"}`}
                    onClick={() => setAccountType("customer")}
                  >
                    Personal
                  </button>
                  <button
                    type="button"
                    className={`button small ${accountType === "business" ? "dark" : "outline"}`}
                    onClick={() => setAccountType("business")}
                  >
                    Business / dealer
                  </button>
                </div>
              </div>
              {accountType === "business" && (
                <fieldset className="business-fields">
                  <legend>Business details</legend>
                  <p className="muted">
                    Dealerships and professional sellers apply here. Our team
                    reviews every application and agrees commercial terms before
                    business selling is activated — choosing Business does not
                    create a commission obligation by itself.
                  </p>
                  <div className="form-grid">
                    {[
                      {
                        key: "businessName",
                        label: "Business name",
                        placeholder: "e.g. Auto Motors (PTY) Ltd",
                      },
                      {
                        key: "registrationNumber",
                        label: "Registration number (optional)",
                        placeholder: "e.g. 2020/123456/07",
                      },
                      {
                        key: "contactName",
                        label: "Contact person",
                        placeholder: "Who should we speak to?",
                      },
                      {
                        key: "phone",
                        label: "Business phone",
                        placeholder: "e.g. 011 555 0100",
                      },
                      {
                        key: "city",
                        label: "City or town",
                        placeholder: "e.g. Johannesburg",
                      },
                      {
                        key: "website",
                        label: "Website (optional)",
                        placeholder: "https://…",
                      },
                    ].map((x) => (
                      <label key={x.key}>
                        {x.label}
                        <input
                          required={[
                            "businessName",
                            "contactName",
                            "phone",
                            "city",
                          ].includes(x.key)}
                          maxLength={150}
                          value={(biz as any)[x.key]}
                          placeholder={x.placeholder}
                          onChange={(e) =>
                            setBiz((p) => ({ ...p, [x.key]: e.target.value }))
                          }
                        />
                      </label>
                    ))}
                    <label>
                      Province
                      <select
                        value={biz.province}
                        onChange={(e) =>
                          setBiz((p) => ({ ...p, province: e.target.value }))
                        }
                      >
                        {provinces.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Anything we should know? (optional)
                    <textarea
                      maxLength={2000}
                      rows={3}
                      value={biz.message}
                      onChange={(e) =>
                        setBiz((p) => ({ ...p, message: e.target.value }))
                      }
                    />
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={bizConsent}
                      onChange={(e) => setBizConsent(e.target.checked)}
                    />
                    I agree that AutoCars may contact me about this business
                    application.
                  </label>
                </fieldset>
              )}
            </>
          )}
          {mode !== "reset" && (
            <label>
              Email address
              <input type="email" name="email" required autoComplete="email" />
            </label>
          )}
          {mode !== "forgot" && (
            <label>
              Password
              <input
                type="password"
                name="password"
                minLength={mode === "login" ? 1 : 12}
                maxLength={128}
                required
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                placeholder={
                  mode === "login" ? "Your password" : "At least 12 characters"
                }
              />
            </label>
          )}

          {mode === "register" && (
            <label className="checkbox">
              <input name="consent" type="checkbox" required />I accept the
              marketplace terms and privacy notice.
            </label>
          )}
          <button className="button dark full" disabled={busy}>
            {busy
              ? "One moment…"
              : mode === "register"
                ? "Create account"
                : mode === "forgot"
                  ? "Send recovery link"
                  : mode === "reset"
                    ? "Set new password"
                    : "Sign in"}
            <ArrowRight size={17} />
          </button>
        </form>
        <div className="auth-switch">
          {mode === "login" ? (
            <>
              <button
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
              >
                New here? Create an account <ArrowUpRight size={14} />
              </button>
              <button
                onClick={() => {
                  setMode("forgot");
                  setError("");
                }}
              >
                Forgot your password?
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Back to sign in
            </button>
          )}
        </div>
        <Link to="/privacy" className="fine-print">
          Privacy & marketplace terms
        </Link>
      </div>
    </div>
  );
}
const numericText = (value: string) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const blank = {
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
export function Sell() {
  return (
    <RequireAuth>
      <SellContent />
    </RequireAuth>
  );
}
function SellContent() {
  const { id } = useParams(),
    { user, notify } = useApp(),
    navigate = useNavigate();
  const [form, setForm] = useState({ ...blank, sellerName: user?.name || "" }),
    [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [payRef, setPayRef] = useState(""),
    [card, setCard] = useState(""),
    [payMsg, setPayMsg] = useState(""),
    [fetching, setFetching] = useState(!!id);
  useEffect(() => {
    if (id)
      api
        .get(`/listings/${id}`)
        .then((r) => {
          if (r.listing.ownerId !== user?.id)
            throw new Error("You can only edit your own listings.");
          setForm({
            ...r.listing,
            year: String(r.listing.year),
            price: String(r.listing.price),
            mileage: String(r.listing.mileage),
          });
        })
        .catch((e) => setError(e.message))
        .finally(() => setFetching(false));
  }, [id]);
  function field(key: string, value: any) {
    setForm((p) => ({ ...p, [key]: value }));
  }
  function listingPayload() {
    const year = Number(form.year),
      price = Number(form.price),
      mileage = Number(form.mileage);
    if (
      ![form.year, form.price, form.mileage].every((v) => v.trim() !== "") ||
      ![year, price, mileage].every(Number.isFinite)
    )
      throw new Error("Enter a valid year, asking price, and mileage.");
    if (
      year < 1900 ||
      year > new Date().getFullYear() + 1 ||
      price < 1000 ||
      price > 100000000 ||
      mileage < 0 ||
      mileage > 3000000
    )
      throw new Error("Check the year, asking price, and mileage values.");
    return { ...form, year, price, mileage };
  }
  async function upload(files: FileList | null) {
    if (!files) return;
    setUploading(true);
    setError("");
    const urls: string[] = [];
    try {
      if (form.images.length + files.length > 12)
        throw new Error("Choose up to 12 photos.");
      for (const f of Array.from(files)) {
        if (f.size > 8 * 1024 * 1024)
          throw new Error("Each photo must be under 8 MB.");
        urls.push((await api.upload(f, f.name)).url);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setForm((p) => ({ ...p, images: [...p.images, ...urls] }));
      setUploading(false);
    }
  }
  const fee = requiresAdFee(user) && !id,
    lastStep = fee ? 3 : 2;
  async function sendListing() {
    setBusy(true);
    setError("");
    try {
      const payload = listingPayload();
      if (!payload.images.length) throw new Error("Add at least one photo.");
      if (id) await api.patch(`/listings/${id}`, payload);
      else
        await api.post("/listings", {
          ...payload,
          paymentRef: payRef || undefined,
        });
      notify(
        "Listing submitted for review. You can track it in your workspace.",
      );
      navigate("/workspace");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    setBusy(true);
    setError("");
    try {
      await startHostedCheckout({ listing: listingPayload() });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step === 0) {
      try {
        listingPayload();
      } catch (err) {
        setError((err as Error).message);
        return;
      }
    }
    if (step < lastStep) {
      setStep(step + 1);
      return;
    }
    if (fee) {
      await pay();
      return;
    }
    await sendListing();
  }
  if (fetching) return <Loading />;
  if (user && !canSell(user))
    return (
      <div className="wrap page">
        <Eyebrow>A NEW CHAPTER FOR YOUR CAR</Eyebrow>
        <h1>One step before you sell.</h1>
        <div className="panel">
          <h3>
            Your business account is{" "}
            {user.businessStatus ? user.businessStatus : "not activated"}.
          </h3>
          <p>
            Dealerships and professional sellers can advertise once the{" "}
            {brand.name} team has reviewed their application and agreed
            commercial terms. You can still browse cars and send enquiries.
          </p>
          <Link className="button dark" to="/workspace">
            Open my workspace <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
    );
  return (
    <div className="wrap page sell-page">
      <Eyebrow>A NEW CHAPTER FOR YOUR CAR</Eyebrow>
      <h1>{id ? "Make it shine." : "Great car. New possibilities."}</h1>
      <p className="lead">
        Tell its story. Add your photos. We’ll take a look before it goes live.
      </p>
      <div className="steps">
        {[
          "The essentials",
          "Photos & story",
          "Your details",
          ...(fee ? ["Advertisement"] : []),
        ].map((s, i) => (
          <button
            key={s}
            disabled={busy || uploading}
            className={i === step ? "active" : ""}
            onClick={() => i < step && setStep(i)}
          >
            <span>{i < step ? <Check size={16} /> : i + 1}</span>
            {s}
          </button>
        ))}
      </div>
      {error && <ErrorBox message={error} />}
      <form className="panel" onSubmit={submit}>
        {step === 0 ? (
          <>
            <h2>Let’s meet your car.</h2>
            <div className="form-grid">
              {[
                { key: "make", label: "Make", placeholder: "e.g. Toyota" },
                {
                  key: "model",
                  label: "Model",
                  placeholder: "e.g. Corolla Cross",
                },
                {
                  key: "variant",
                  label: "Variant (optional)",
                  placeholder: "e.g. 1.8 XR Hybrid",
                },
              ].map((x) => (
                <label key={x.key}>
                  {x.label}
                  <input
                    required={x.key !== "variant"}
                    maxLength={x.key === "variant" ? 120 : 60}
                    value={(form as any)[x.key]}
                    placeholder={x.placeholder}
                    onChange={(e) => field(x.key, e.target.value)}
                  />
                </label>
              ))}
              {[
                {
                  key: "year",
                  label: "Year",
                  min: 1900,
                  max: new Date().getFullYear() + 1,
                },
                {
                  key: "price",
                  label: "Asking price (R)",
                  min: 1000,
                  max: 100000000,
                },
                { key: "mileage", label: "Mileage (km)", min: 0, max: 3000000 },
              ].map((x) => (
                <label key={x.key}>
                  {x.label}
                  <input
                    required
                    type="number"
                    min={x.min}
                    max={x.max}
                    value={(form as any)[x.key]}
                    onChange={(e) => field(x.key, e.target.value)}
                  />
                </label>
              ))}
              {[
                { key: "bodyType", label: "Body type", values: bodyTypes },
                { key: "fuel", label: "Fuel type", values: fuels },
                {
                  key: "transmission",
                  label: "Transmission",
                  values: ["Automatic", "Manual"],
                },
              ].map((x) => (
                <label key={x.key}>
                  {x.label}
                  <select
                    value={(form as any)[x.key]}
                    onChange={(e) => field(x.key, e.target.value)}
                  >
                    {x.values.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </>
        ) : step === 1 ? (
          <>
            <h2>Show its best side.</h2>
            <p className="muted">
              Up to 12 photos. JPEG, PNG or WebP, under 8 MB each. The first
              photo is your cover.
            </p>
            <label className="upload-zone">
              <Upload size={28} />
              <b>
                {uploading
                  ? "Uploading & optimising…"
                  : "Choose your car photos"}
              </b>
              <span>Clear photos. Every angle. No personal documents.</span>
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={uploading}
                onChange={(e) => {
                  upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="upload-previews">
              {form.images.map((url, i) => (
                <div key={url}>
                  <img src={api.image(url)} alt={`Listing photo ${i + 1}`} />
                  {i === 0 && <small>Cover</small>}
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={async () => {
                      field(
                        "images",
                        form.images.filter((x) => x !== url),
                      );
                      if (!id)
                        try {
                          await api.delete(
                            `/uploads/${url.split("/").pop()?.replace(".webp", "")}`,
                          );
                        } catch (e) {
                          notify((e as Error).message);
                        }
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <label>
              Tell buyers about your car
              <textarea
                required
                minLength={30}
                maxLength={6000}
                rows={6}
                value={form.description}
                onChange={(e) => field("description", e.target.value)}
                placeholder="Service history, condition, favourite features — the details buyers want to know."
              />
            </label>
          </>
        ) : step === 3 ? (
          <>
            <h2>Your advertisement.</h2>
            <p className="muted">
              Private sellers pay a one-off {money(brand.adFee)} fee to
              advertise a vehicle for {brand.adDays} days. Dealerships and{" "}
              {brand.name} partners advertise under agreed commercial terms
              instead.
            </p>
            <div className="listing-summary">
              <CarFront />
              <div>
                <h3>
                  {form.year} {form.make} {form.model}
                </h3>
                <p>
                  {money(numericText(form.price))} · {brand.adDays}-day
                  advertisement
                </p>
              </div>
            </div>
            <p className="fine-print">
              Continue to Payfast’s secure checkout. AutoCars never receives
              your card details. Your advertisement is submitted only after
              verified payment confirmation; its {brand.adDays} days start on
              first approval.
            </p>
          </>
        ) : (
          <>
            <h2>The final details.</h2>
            <div className="form-grid">
              <label>
                Seller or dealership name
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={form.sellerName}
                  onChange={(e) => field("sellerName", e.target.value)}
                />
              </label>
              <label>
                Phone number
                <input
                  type="tel"
                  required
                  pattern="[+0-9 ()-]{9,20}"
                  value={form.phone}
                  onChange={(e) => field("phone", e.target.value)}
                />
              </label>
              <label>
                Province
                <select
                  value={form.province}
                  onChange={(e) => field("province", e.target.value)}
                >
                  {provinces.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                City or town
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={form.city}
                  onChange={(e) => field("city", e.target.value)}
                />
              </label>
            </div>
            <div className="listing-summary">
              <CarFront />
              <div>
                <h3>
                  {form.year} {form.make} {form.model}
                </h3>
                <p>
                  {money(numericText(form.price))} ·{" "}
                  {numericText(form.mileage).toLocaleString()} km ·{" "}
                  {form.images.length} photos
                </p>
              </div>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={!!form.greatValue}
                onChange={(e) => field("greatValue", e.target.checked)}
              />
              Mark as great value — priced to sell
            </label>
            <label className="checkbox">
              <input type="checkbox" required />I confirm that I can legally
              advertise this vehicle, that the details are accurate, and that I
              accept the marketplace terms.
            </label>
            <p className="fine-print">
              Your listing will be reviewed before publication. Editing an
              existing listing sends it back for review.
            </p>
          </>
        )}
        <div className="form-actions">
          {step > 0 && (
            <button
              type="button"
              className="button outline"
              onClick={() => setStep(step - 1)}
            >
              Back
            </button>
          )}
          <button
            className="button dark"
            disabled={busy || uploading || (step === 1 && !form.images.length)}
          >
            {busy
              ? "Submitting…"
              : step === lastStep
                ? fee
                  ? `Pay ${money(brand.adFee)} & submit`
                  : "Submit for review"
                : "Continue"}
            <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </div>
  );
}
export function Workspace() {
  return (
    <RequireAuth>
      <WorkspaceContent />
    </RequireAuth>
  );
}
const adExpired = (l: Listing) =>
  !!l.paidUntil && new Date(l.paidUntil).getTime() <= Date.now();
function WorkspaceContent() {
  const { user, notify, subscribeLive } = useApp();
  const [routeParams] = useSearchParams();
  const [tab, setTab] = useState("overview"),
    [confirm, setConfirm] = useState<{ id: string; action: string } | null>(
      null,
    ),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [renew, setRenew] = useState<Listing | null>(null),
    [renewCard, setRenewCard] = useState(""),
    [renewMsg, setRenewMsg] = useState(""),
    [chat, setChat] = useState<string | null>(null);
  const isAdmin = user?.role === "admin";
  const isBusiness = user?.accountType === "business" && !isAdmin;
  useEffect(() => {
    const requested = routeParams.get("tab");
    if (
      requested &&
      [
        "overview",
        "inventory",
        "leads",
        ...(isAdmin
          ? ["businesses", "payments", "users", "audit"]
          : isBusiness
            ? ["business"]
            : []),
      ].includes(requested)
    )
      setTab(requested);
  }, [routeParams, isAdmin, isBusiness]);
  const {
    data: listings,
    reload: reloadListings,
    error,
    loading,
  } = useLoad<{ items: Listing[] }>(
    isAdmin ? "/admin/listings" : "/me/listings",
    { items: [] },
    ["account"],
  );
  const { data: leads, reload: reloadLeads } = useLoad<{ items: Lead[] }>(
    isAdmin ? "/admin/leads" : "/me/leads",
    { items: [] },
    ["account"],
  );
  const [users, setUsers] = useState<any[]>([]),
    [audit, setAudit] = useState<any[]>([]),
    [stats, setStats] = useState<any>(null);
  async function refreshAdmin() {
    if (isAdmin) {
      try {
        const [s, u, a] = await Promise.all([
          api.get("/admin/overview"),
          api.get("/admin/users"),
          api.get("/admin/audit"),
        ]);
        setStats(s);
        setUsers(u.items);
        setAudit(a.items);
      } catch (e) {
        notify((e as Error).message);
      }
    }
  }
  useEffect(() => {
    refreshAdmin();
  }, [isAdmin]);
  useLiveUpdate(refreshAdmin, ["all", "admin"]);
  async function act(id: string, action: string) {
    setBusy(true);
    try {
      if (action === "delete") await api.delete(`/listings/${id}`);
      else if (action === "sold") await api.post(`/listings/${id}/sold`);
      else
        await api.patch(`/admin/listings/${id}`, {
          status: action,
          reason,
          featured: false,
        });
      setConfirm(null);
      setReason("");
      await reloadListings();
      await refreshAdmin();
      notify("Listing updated.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function renewAd() {
    if (!renew) return;
    setBusy(true);
    setRenewMsg("");
    try {
      await startHostedCheckout({ renewId: renew.id });
    } catch (e) {
      setRenewMsg((e as Error).message);
      setBusy(false);
    }
  }
  const counts =
    isAdmin && stats
      ? [
          ["Live listings", stats.published],
          ["Awaiting review", stats.pending],
          ["Business applications", stats.businessPending],
          ["Registered users", stats.users],
          ["Total enquiries", stats.leads],
        ]
      : [
          ["My listings", listings.items.length],
          [
            "Live listings",
            listings.items.filter((l) => l.status === "published").length,
          ],
          [
            "Awaiting review",
            listings.items.filter((l) => l.status === "pending").length,
          ],
          [
            "New enquiries",
            leads.items.filter((l) => l.status === "new").length,
          ],
        ];
  return (
    <div className="workspace">
      <aside className="workspace-nav">
        <Eyebrow>{isAdmin ? "OPERATIONS" : "SELLER WORKSPACE"}</Eyebrow>
        {[
          { key: "overview", label: "Overview", icon: LayoutDashboard },
          {
            key: "inventory",
            label: isAdmin ? "All inventory" : "My inventory",
            icon: CarFront,
          },
          {
            key: "leads",
            label: isAdmin ? "All enquiries" : "My enquiries",
            icon: Inbox,
          },
          ...(isAdmin
            ? [
                {
                  key: "businesses",
                  label: "Business applications",
                  icon: Building2,
                },

                {
                  key: "payments",
                  label: "Advertisement payments",
                  icon: Inbox,
                },
                { key: "users", label: "People", icon: Users },
                { key: "audit", label: "Activity log", icon: Clock },
              ]
            : isBusiness
              ? [
                  {
                    key: "business",
                    label: "Business account",
                    icon: Building2,
                  },
                ]
              : []),
        ].map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "active" : ""}
            onClick={() => setTab(t.key)}
          >
            <t.icon size={17} />
            {t.label}
            {t.key === "inventory" && <small>{listings.items.length}</small>}
          </button>
        ))}
        <Link className="button dark full" to="/sell">
          <Plus size={16} />
          Add a vehicle
        </Link>
        <p>
          Less admin.
          <br />
          More open road.
        </p>
      </aside>
      <div className="workspace-main">
        <Eyebrow>
          {isAdmin ? "MISSION CONTROL" : "YOUR BUSINESS, IN MOTION"}
        </Eyebrow>
        <div className="workspace-title">
          <div>
            <h1>
              {tab === "overview"
                ? `Welcome back, ${user?.name.split(" ")[0]}.`
                : tab === "inventory"
                  ? "Your inventory."
                  : tab === "leads"
                    ? "The conversation starts here."
                    : tab === "businesses"
                      ? "Dealers welcome. Terms agreed."
                      : tab === "business"
                        ? "Your business account."
                        : tab === "users"
                          ? "Good people. Great drives."
                          : "Every move, recorded."}
            </h1>
            <p className="muted">
              {isAdmin
                ? "Keep the marketplace moving."
                : "A clear view of your cars and conversations."}
            </p>
          </div>
          <span className="operator-badge">
            <ShieldCheck size={15} />
            {isAdmin ? "Administrator" : "Seller"}
          </span>
        </div>
        {error && <ErrorBox message={error} />}
        <div className="stat-grid">
          {counts.map(([label, value]) => (
            <div key={label as string}>
              <span>{label}</span>
              <b>{value}</b>
              <small>Current total</small>
            </div>
          ))}
        </div>
        {tab === "overview" && (
          <div className="panel">
            <Eyebrow>WHAT NEEDS YOUR ATTENTION</Eyebrow>
            <h2>
              {listings.items.filter((l) => l.status === "pending").length}{" "}
              listings awaiting review.
            </h2>
            <p className="muted">
              {isAdmin
                ? "Review vehicle details and photos before approving a listing for the marketplace."
                : "Your submissions appear here while they are reviewed. You can edit them from inventory."}
            </p>
            <button className="button dark" onClick={() => setTab("inventory")}>
              Open inventory <ArrowUpRight size={16} />
            </button>
          </div>
        )}
        {(tab === "inventory" || tab === "overview") &&
          (loading ? (
            <Loading />
          ) : !listings.items.length ? (
            <Empty
              title="Your next chapter starts with a listing."
              action={
                <Link className="button dark" to="/sell">
                  Add a vehicle <Plus size={16} />
                </Link>
              }
            >
              No inventory yet. Add your first car to get things moving.
            </Empty>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Price</th>
                    <th>Status</th>
                    <th>Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.items.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <Link className="table-car" to={`/cars/${l.id}`}>
                          <img src={api.image(l.images[0])} alt="" />
                          <div>
                            <b>
                              {l.year} {l.make} {l.model}
                            </b>
                            <small>
                              {l.city} · {l.mileage.toLocaleString()} km
                            </small>
                            {l.rejectionReason && (
                              <small className="danger">
                                {l.rejectionReason}
                              </small>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td>{money(l.price)}</td>
                      <td>
                        <span className={`status ${l.status}`}>{l.status}</span>
                        {l.featured && <small>Featured</small>}
                        {l.paidUntil && (
                          <small className={adExpired(l) ? "danger" : ""}>
                            {adExpired(l)
                              ? "Ad expired"
                              : `Ad until ${new Date(l.paidUntil!).toLocaleDateString("en-ZA")}`}
                          </small>
                        )}
                      </td>
                      <td>
                        {new Date(l.createdAt).toLocaleDateString("en-ZA")}
                      </td>
                      <td>
                        <div className="table-actions">
                          {isAdmin && l.status !== "published" && (
                            <button
                              onClick={() =>
                                setConfirm({ id: l.id, action: "published" })
                              }
                            >
                              Approve
                            </button>
                          )}
                          {isAdmin && l.status !== "rejected" && (
                            <button
                              onClick={() =>
                                setConfirm({ id: l.id, action: "rejected" })
                              }
                            >
                              Reject
                            </button>
                          )}
                          {isAdmin && l.status === "published" && (
                            <button
                              onClick={async () => {
                                try {
                                  await api.patch(`/admin/listings/${l.id}`, {
                                    status: "published",
                                    featured: !l.featured,
                                  });
                                  reloadListings();
                                  refreshAdmin();
                                } catch (e) {
                                  notify((e as Error).message);
                                }
                              }}
                            >
                              {l.featured ? "Unfeature" : "Feature"}
                            </button>
                          )}
                          {l.ownerId === user?.id && l.paidUntil && (
                            <button onClick={() => setRenew(l)}>
                              Renew ad
                            </button>
                          )}
                          {l.ownerId === user?.id && (
                            <Link to={`/sell/${l.id}`}>Edit</Link>
                          )}
                          {l.status !== "sold" && (
                            <button
                              onClick={() =>
                                setConfirm({ id: l.id, action: "sold" })
                              }
                            >
                              Mark sold
                            </button>
                          )}
                          <button
                            className="danger"
                            onClick={() =>
                              setConfirm({ id: l.id, action: "delete" })
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        {tab === "leads" &&
          (leads.items.length ? (
            <div className="lead-list">
              {leads.items.map((l) => (
                <div
                  className="panel"
                  key={l.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => setChat(l.id)}
                >
                  <div className="lead-header">
                    <div>
                      <h3>
                        {l.name}
                        {!!l.unread && (
                          <span
                            className="status pending"
                            style={{ marginLeft: 8 }}
                          >
                            {l.unread} new
                          </span>
                        )}
                      </h3>
                      <p>
                        {l.year} {l.make} {l.model}
                      </p>
                    </div>
                    <select
                      aria-label="Enquiry status"
                      value={l.status}
                      onChange={async (e) => {
                        try {
                          await api.patch(
                            `${isAdmin ? "/admin/leads" : "/me/leads"}/${l.id}`,
                            {
                              status: e.target.value,
                            },
                          );
                          reloadLeads();
                        } catch (e) {
                          notify((e as Error).message);
                        }
                      }}
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                  <p className="description">{l.message}</p>
                  <div
                    className="button-row"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="button dark small"
                      onClick={() => setChat(l.id)}
                    >
                      Message
                    </button>
                    <a
                      className="button outline small"
                      href={`mailto:${l.email}`}
                    >
                      Email buyer <ArrowUpRight size={14} />
                    </a>
                    <a className="button outline small" href={`tel:${l.phone}`}>
                      {l.phone}
                    </a>
                  </div>
                  <small className="muted">
                    {new Date(l.createdAt).toLocaleString("en-ZA")}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Your next conversation is on its way.">
              Enquiries for your listings will appear here. Email notifications
              require the operator to configure email delivery.
            </Empty>
          ))}
        {tab === "businesses" && isAdmin && <AdminBusinesses />}
        {tab === "payments" && isAdmin && <AdminPayments />}
        {tab === "business" && isBusiness && <BusinessPanel />}
        {tab === "users" && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Email verified</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.role}</td>
                    <td>{u.verified ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === "audit" && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>By</th>
                  <th>Target</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td>{a.action}</td>
                    <td>{a.actor || "Deleted account"}</td>
                    <td>
                      <small>{a.target}</small>
                    </td>
                    <td>{new Date(a.created_at).toLocaleString("en-ZA")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {confirm && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <h2 id="confirm-title">
              {confirm.action === "delete"
                ? "Delete this listing?"
                : confirm.action === "published"
                  ? "Publish this listing?"
                  : confirm.action === "rejected"
                    ? "Send back to the seller?"
                    : "Mark this car as sold?"}
            </h2>
            <p>
              {confirm.action === "delete"
                ? "The listing and its enquiries will be permanently removed."
                : "This changes the listing’s availability on the marketplace."}
            </p>
            {confirm.action === "rejected" && (
              <label>
                Reason for the seller
                <textarea
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain what needs to change."
                />
              </label>
            )}
            <div className="button-row">
              <button
                className="button outline"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="button dark"
                disabled={
                  busy || (confirm.action === "rejected" && !reason.trim())
                }
                onClick={() => act(confirm.id, confirm.action)}
              >
                {busy ? "Updating…" : "Confirm"}
                <Check size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
      {renew && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="renew-title"
          >
            <h2 id="renew-title">Renew this advertisement</h2>
            <p>
              {renew.year} {renew.make} {renew.model} — {money(brand.adFee)} for
              another {brand.adDays} days.
            </p>
            {renewMsg && <p className="danger">{renewMsg}</p>}
            <p className="fine-print">
              You’ll enter payment details on Payfast’s secure checkout. Renewal
              is applied only after server-verified payment.
            </p>
            <div className="button-row">
              <button
                className="button outline"
                disabled={busy}
                onClick={() => setRenew(null)}
              >
                Cancel
              </button>
              <button className="button dark" disabled={busy} onClick={renewAd}>
                {busy ? "Paying…" : `Pay ${money(brand.adFee)}`}
                <Check size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
      {chat && (
        <ChatModal
          leadId={chat}
          title={
            leads.items.find((l) => l.id === chat)
              ? `${leads.items.find((l) => l.id === chat)!.name} — ${leads.items.find((l) => l.id === chat)!.year} ${leads.items.find((l) => l.id === chat)!.make} ${leads.items.find((l) => l.id === chat)!.model}`
              : "Conversation"
          }
          onClose={() => {
            setChat(null);
            reloadLeads();
          }}
        />
      )}
    </div>
  );
}
const businessStatusText: Record<BusinessStatus, string> = {
  pending: "Application under review",
  contacted: "AutoCars has been in touch",
  active: "Selling activated",
  rejected: "Application not approved",
  suspended: "Selling suspended",
};
function AdminBusinesses() {
  const { data, reload, error, loading } = useLoad<{
    items: BusinessApplication[];
  }>("/admin/businesses", { items: [] }, ["account"]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!data.items.length)
    return (
      <Empty title="No business applications yet.">
        Dealerships and professional sellers can apply during signup. Each
        application is reviewed before commercial terms are agreed.
      </Empty>
    );
  return (
    <div className="lead-list">
      {data.items.map((app) => (
        <BusinessReview key={app.id} app={app} onUpdated={reload} />
      ))}
    </div>
  );
}
function BusinessReview({
  app,
  onUpdated,
}: {
  app: BusinessApplication;
  onUpdated: () => void;
}) {
  const { notify } = useApp();
  const [status, setStatus] = useState<Exclude<BusinessStatus, "pending">>(
      app.status === "pending"
        ? "contacted"
        : (app.status as Exclude<BusinessStatus, "pending">),
    ),
    [note, setNote] = useState(app.reviewNote),
    [reference, setReference] = useState(app.agreementReference),
    [terms, setTerms] = useState(false),
    [busy, setBusy] = useState(false);
  const needsTerms = status === "active";
  async function save() {
    setBusy(true);
    try {
      await api.patch(`/admin/businesses/${app.id}`, {
        status,
        note,
        agreementReference: reference,
        termsConfirmed: terms,
      });
      notify("Business application updated.");
      onUpdated();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel">
      <div className="lead-header">
        <div>
          <h3>{app.businessName}</h3>
          <p>
            {app.contactName} · {app.email} · {app.phone}
          </p>
          <p className="muted">
            {app.city}, {app.province}
            {app.registrationNumber ? ` · Reg ${app.registrationNumber}` : ""}
          </p>
        </div>
        <span
          className={`status ${app.status === "active" ? "published" : app.status === "rejected" || app.status === "suspended" ? "rejected" : "pending"}`}
        >
          {app.status}
        </span>
      </div>
      {app.website && (
        <p>
          <a href={app.website} target="_blank" rel="noreferrer">
            {app.website}
          </a>
        </p>
      )}
      {app.message && <p className="description">{app.message}</p>}
      <p className="muted">
        Applied {new Date(app.createdAt).toLocaleDateString("en-ZA")}
        {app.reviewNote ? ` · Last note: ${app.reviewNote}` : ""}
      </p>
      <div className="form-grid">
        <label>
          Decision
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as Exclude<BusinessStatus, "pending">)
            }
          >
            <option value="contacted">Contacted</option>
            <option value="active">Active — terms agreed</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
        <label>
          Note for the applicant
          <textarea
            value={note}
            maxLength={1500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain the decision or next steps."
          />
        </label>
        <label>
          Agreement reference {needsTerms && "(required to activate)"}
          <input
            value={reference}
            maxLength={500}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. Dealer agreement ref AC-2026-014"
          />
        </label>
      </div>
      {needsTerms && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
          />
          I confirm the commercial agreement (including any commission or
          percentage terms) has been concluded and is recorded above.
        </label>
      )}
      <button
        className="button dark"
        disabled={
          busy ||
          note.trim().length < 5 ||
          (needsTerms && (!terms || !reference.trim()))
        }
        onClick={save}
      >
        {busy ? "Saving…" : "Save decision"}
        <Check size={16} />
      </button>
    </div>
  );
}
function BusinessPanel() {
  const { notify } = useApp();
  const { data, reload, error, loading } = useLoad<{
    application: BusinessApplication | null;
  }>("/me/business", { application: null }, ["account"]);
  const app = data.application;
  const [form, setForm] = useState({ ...emptyBusiness });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const editable =
    !app || app.status === "pending" || app.status === "rejected";
  useEffect(() => {
    if (app)
      setForm({
        businessName: app.businessName,
        registrationNumber: app.registrationNumber,
        contactName: app.contactName,
        phone: app.phone,
        province: app.province,
        city: app.city,
        website: app.website,
        message: app.message,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id]);
  function field(key: string, value: string) {
    setForm((p) => ({ ...p, [key]: value }));
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/me/business", { ...form, contactConsent: consent });
      notify("Business application submitted for review.");
      setConsent(false);
      reload();
    } catch (e2) {
      notify((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  return (
    <div className="panel">
      <Eyebrow>DEALERSHIPS & PROFESSIONAL SELLERS</Eyebrow>
      <h2>{app ? businessStatusText[app.status] : "Apply as a business"}</h2>
      {app && (
        <p className="muted">
          {app.businessName} · Applied{" "}
          {new Date(app.createdAt).toLocaleDateString("en-ZA")}
        </p>
      )}
      {app?.status === "active" && (
        <p>
          Your agreed terms are on file
          {app.agreementReference ? ` (${app.agreementReference})` : ""}. You
          can list vehicles from the inventory tab.
        </p>
      )}
      {(app?.status === "rejected" || app?.status === "suspended") &&
        app.reviewNote && <p className="description">{app.reviewNote}</p>}
      {app?.status === "pending" && (
        <p>
          Our team reviews every application and agrees commercial terms before
          business selling is activated. You can update your details below while
          it is pending.
        </p>
      )}
      {app?.status === "contacted" && (
        <p>
          Our team has been in touch. Business selling activates once terms are
          agreed — contact AutoCars to amend an application under review.
        </p>
      )}
      {editable ? (
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid">
            {[
              {
                key: "businessName",
                label: "Business name",
                required: true,
              },
              {
                key: "registrationNumber",
                label: "Registration number (optional)",
                required: false,
              },
              { key: "contactName", label: "Contact person", required: true },
              { key: "phone", label: "Business phone", required: true },
              { key: "city", label: "City or town", required: true },
              { key: "website", label: "Website (optional)", required: false },
            ].map((x) => (
              <label key={x.key}>
                {x.label}
                <input
                  required={x.required}
                  maxLength={150}
                  value={(form as any)[x.key]}
                  onChange={(e) => field(x.key, e.target.value)}
                />
              </label>
            ))}
            <label>
              Province
              <select
                value={form.province}
                onChange={(e) => field("province", e.target.value)}
              >
                {provinces.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Anything we should know? (optional)
            <textarea
              maxLength={2000}
              rows={3}
              value={form.message}
              onChange={(e) => field("message", e.target.value)}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              required
            />
            I agree that AutoCars may contact me about this business
            application.
          </label>
          <button className="button dark" disabled={busy}>
            {busy
              ? "Submitting…"
              : app?.status === "rejected"
                ? "Resubmit application"
                : "Submit application"}
            <Check size={16} />
          </button>
        </form>
      ) : (
        <p className="muted">
          This application is with the AutoCars team. Selling is enabled once
          your agreed terms are activated.
        </p>
      )}
    </div>
  );
}

function AdminPayments() {
  const { data, error } = useLoad<{ items: any[] }>("/admin/payments", {
    items: [],
  });
  return (
    <div className="panel">
      <h2>Advertisement payments</h2>
      {error && <ErrorBox message={error} />}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Fulfilment</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>
                  {p.name}
                  <small>{p.email}</small>
                </td>
                <td>{money(p.amount)}</td>
                <td>{p.status}</td>
                <td>
                  {p.error ||
                    (p.listingId ? "Advertisement linked" : "Awaiting payment")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fine-print">
        Investigate any paid order with a fulfilment error. Refunds are managed
        in your payment provider account.
      </p>
    </div>
  );
}
