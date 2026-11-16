import brand from "../../../config/brand.json";
export { brand };
export const provinces = [
  "Gauteng",
  "Western Cape",
  "KwaZulu-Natal",
  "Eastern Cape",
  "Free State",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
];
export const bodyTypes = [
  "SUV",
  "Hatchback",
  "Sedan",
  "Bakkie",
  "Coupé",
  "Convertible",
  "MPV",
  "Van",
  "Wagon",
];
export const fuels = ["Petrol", "Diesel", "Hybrid", "Electric"];
export type User = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  verified: boolean;
  accountType: "customer" | "business";
  businessStatus: BusinessStatus | null;
};
export type Listing = {
  id: string;
  ownerId: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  price: number;
  mileage: number;
  bodyType: string;
  fuel: string;
  transmission: string;
  province: string;
  city: string;
  description: string;
  images: string[];
  status: "pending" | "published" | "rejected" | "sold";
  sellerName: string;
  phone: string;
  createdAt: string;
  featured: boolean;
  greatValue: boolean;
  paidUntil?: string;
  rejectionReason: string;
};
export type Filters = {
  q?: string;
  make?: string;
  bodyType?: string;
  province?: string;
  fuel?: string;
  transmission?: string;
  minPrice?: string;
  maxPrice?: string;
  minYear?: string;
  maxMileage?: string;
  greatValue?: string;
  sort?: string;
  page?: string;
};
export type ChatMessage = {
  id: string;
  leadId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
};
export type Enquiry = {
  id: string;
  listingId: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  status: string;
  createdAt: string;
  make: string;
  model: string;
  year: number;
  unread?: number;
};
export type Lead = {
  id: string;
  listingId: string;
  buyerId: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  status: "new" | "contacted" | "closed";
  createdAt: string;
  make: string;
  model: string;
  year: number;
  unread?: number;
};
export type SavedSearch = {
  id: string;
  name: string;
  filters: Filters;
  createdAt: string;
};
export const money = (value: number) =>
  new Intl.NumberFormat(brand.locale, {
    style: "currency",
    currency: brand.currency,
    maximumFractionDigits: 0,
  }).format(value);
export function payment(
  price: number,
  deposit = 0,
  rate = 11.75,
  months = 72,
  balloon = 0,
) {
  const principal = Math.max(0, price - deposit),
    r = rate / 1200,
    b = (price * balloon) / 100;
  return r === 0
    ? Math.max(0, (principal - b) / months)
    : Math.max(
        0,
        ((principal - b / Math.pow(1 + r, months)) * r) /
          (1 - Math.pow(1 + r, -months)),
      );
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export class ApiClient {
  token: string | null = null;
  constructor(
    public base = "",
    public timeoutMs = 20000,
    private client?: string,
  ) {
    this.base = base.replace(/\/$/, "");
  }
  async request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    const h = new Headers(options.headers);
    if (options.body && !(options.body instanceof FormData))
      h.set("Content-Type", "application/json");
    if (this.token) h.set("Authorization", `Bearer ${this.token}`);
    if (this.client) h.set("X-Client", this.client);
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    else options.signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(
      abort,
      options.body instanceof FormData
        ? Math.max(this.timeoutMs, 120000)
        : this.timeoutMs,
    );
    try {
      const res = await fetch(`${this.base}/api${path}`, {
        ...options,
        headers: h,
        credentials: "include",
        signal: controller.signal,
      });
      const data = await res.json().catch(() => {
        throw new ApiError(
          "The service returned an unreadable response. Please try again.",
          502,
        );
      });
      if (!res.ok)
        throw new ApiError(data.message || "Request failed.", res.status);
      return data;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(
        controller.signal.aborted
          ? "This is taking longer than expected. Please try again."
          : "We couldn’t connect. Check your connection and try again.",
      );
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
    }
  }

  get<T = any>(path: string) {
    return this.request<T>(path);
  }
  post<T = any>(path: string, body: unknown = {}) {
    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  patch<T = any>(path: string, body: unknown) {
    return this.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }
  delete<T = any>(path: string) {
    return this.request<T>(path, { method: "DELETE" });
  }
  upload(file: Blob, name: string) {
    const f = new FormData();
    f.append("file", file, name);
    return this.request<{ url: string }>("/uploads", {
      method: "POST",
      body: f,
    });
  }
  uploadForm<T = any>(path: string, body: FormData): Promise<T> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${this.base}/api${path}`);
      xhr.timeout = 120000;
      if (this.token) xhr.setRequestHeader("Authorization", `Bearer ${this.token}`);
      if (this.client) xhr.setRequestHeader("X-Client", this.client);
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new ApiError(data.message || "Upload failed.", xhr.status));
        } catch {
          reject(new ApiError("The service returned an unreadable response.", 502));
        }
      };
      xhr.onerror = () =>
        reject(
          new ApiError(
            "We couldn’t connect. Check your connection and try again.",
          ),
        );
      xhr.ontimeout = () =>
        reject(
          new ApiError("This is taking longer than expected. Please try again."),
        );
      xhr.send(body);
    });
  }
  image(path: string) {
    return path.startsWith("/") ? this.base + path : path;
  }
}
export { LiveClient, type LiveStatus } from "./live";
export type BusinessStatus =
  "pending" | "contacted" | "active" | "rejected" | "suspended";
export type BusinessDetails = {
  businessName: string;
  registrationNumber: string;
  contactName: string;
  phone: string;
  province: string;
  city: string;
  website: string;
  message: string;
};
export type BusinessApplication = BusinessDetails & {
  id: string;
  userId: string;
  email: string;
  status: BusinessStatus;
  reviewNote: string;
  agreementReference: string;
  createdAt: string;
  updatedAt: string;
};
export const canSell = (user: User | null) =>
  !!user &&
  (user.role === "admin" ||
    user.accountType !== "business" ||
    user.businessStatus === "active");
export const requiresAdFee = (
  user: { accountType: string; role: string } | null,
) => !!user && user.role !== "admin" && user.accountType === "customer";
