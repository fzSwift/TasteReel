import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { isCloudinaryConfigured, uploadVideoToCloudinary } from "../../utils/cloudinary";
import { isOfflineDemoForced, supabase } from "../../utils/supabase";
import { mockMenuItems, mockRestaurants } from "../data/mockData";
import {
  AuthStatus,
  CartItem,
  CustomerDailyRestaurantActions,
  MenuItem,
  OrderStatus,
  OrderTicket,
  ProfileChangeRequest,
  ProfileRequestableRole,
  Restaurant,
  Role,
  UserProfile,
} from "../types";

export type SupabaseConnectionState =
  | { status: "checking" }
  | { status: "connected" }
  | { status: "demo"; hint: string }
  | { status: "error"; message: string };

export type LocationStatus = "idle" | "loading" | "granted" | "denied";

type AppContextValue = {
  /** True when Supabase client is configured (email auth available). */
  hasSupabaseAuth: boolean;
  authStatus: AuthStatus;
  session: Session | null;
  userProfile: UserProfile | null;
  role: Role;
  activeRestaurantId: string | null;
  restaurants: Restaurant[];
  menuItems: MenuItem[];
  cartItems: CartItem[];
  orders: OrderTicket[];
  /** Re-fetch order tickets from Supabase (e.g. after approval adds a QR code). */
  refreshOrders: () => Promise<void>;
  customerLocation: { latitude: number; longitude: number } | null;
  userLocation: { latitude: number; longitude: number; name: string } | null;
  locationStatus: LocationStatus;
  locationSource: "none" | "gps" | "manual";
  /** Foreground location permission for this device session. */
  locationPermission: "undetermined" | "granted" | "denied";
  /** Last GPS read error (e.g. timeout); null when OK or not yet attempted. */
  locationError: string | null;
  hasVotedThisWeek: boolean;
  supabaseConnection: SupabaseConnectionState;
  addToCart: (menuItemId: string) => void;
  removeFromCart: (menuItemId: string) => void;
  placeOrder: () => Promise<{ ok: true; orderId: string } | { ok: false; reason: string }>;
  acceptOrder: (orderId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  acceptDelivery: (orderId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  pickupOrder: (orderId: string) => Promise<void>;
  voteForRestaurant: (restaurantId: string) => Promise<void>;
  totalPrice: number;
  refreshSupabase: () => void;
  /** No-op while signed in with Supabase (role comes from profile). */
  setRole: (role: Role) => void;
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ ok: true; needsEmailConfirmation: boolean } | { ok: false; reason: string }>;
  signOut: () => Promise<void>;
  updateProfile: (fullName: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Re-fetch `profiles` row for the signed-in user (e.g. after admin approves a role change). */
  refreshUserProfile: () => Promise<void>;
  myPendingProfileChangeRequest: ProfileChangeRequest | null;
  pendingProfileChangeRequestsForAdmin: ProfileChangeRequest[];
  refreshMyProfileChangeRequest: () => Promise<void>;
  refreshAdminProfileChangeRequests: () => Promise<void>;
  submitProfileChangeRequest: (
    requestedRole: ProfileRequestableRole,
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
  resolveProfileChangeRequest: (
    requestId: string,
    action: "approve" | "reject",
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
  setActiveRestaurantId: (restaurantId: string | null) => void;
  refreshLocation: () => Promise<void>;
  setManualLocation: (
    latitude: number,
    longitude: number,
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
  distanceToRestaurantKm: (restaurant: Restaurant) => number | null;
  addRestaurant: (input: {
    name: string;
    cuisine: string;
    address: string;
    latitude?: number;
    longitude?: number;
  }) => Promise<{ ok: true } | { ok: false; reason: string }>;
  approveRestaurant: (restaurantId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  freezeRestaurant: (restaurantId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  reportRestaurant: (restaurantId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Like / unlike for this device; persists until toggled off. */
  toggleRestaurantLike: (
    restaurantId: string,
  ) => Promise<{ ok: true; liked: boolean } | { ok: false; reason: string }>;
  customerDailyRestaurantActions: CustomerDailyRestaurantActions;
  /** Restaurant ids this customer has currently "liked" (persisted). */
  customerLikedRestaurantIds: string[];
  updateRestaurant: (
    restaurantId: string,
    input: {
      name: string;
      cuisine: string;
      address: string;
      latitude?: number;
      longitude?: number;
    },
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
  deleteRestaurant: (restaurantId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  addMenuItem: (input: {
    restaurantId: string;
    title: string;
    description: string;
    price: number;
    videoUrl?: string;
    videoFile?: {
      uri: string;
      name?: string;
      mimeType?: string;
      byteSize?: number;
      webFile?: Blob;
    };
  }) => Promise<{ ok: true } | { ok: false; reason: string }>;
  deleteMenuItem: (menuItemId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  resolveVideoPlaybackUrl: (videoUrl: string) => Promise<string>;
};

const AppContext = createContext<AppContextValue | null>(null);

/** Turn PostgREST errors into something actionable in the UI. */
export function formatSupabaseSetupError(message: string, code?: string | null): string {
  const m = message.toLowerCase();
  if (code === "PGRST205") {
    return (
      "Supabase API cannot see `public.restaurants` yet (PGRST205). " +
      "If the table exists, run `NOTIFY pgrst, 'reload schema';` in SQL Editor, " +
      "then tap Try again."
    );
  }
  if (
    m.includes("could not find the table") ||
    m.includes("schema cache") ||
    m.includes("does not exist")
  ) {
    return (
      "The `restaurants` / `menu_items` tables are not in your database yet. " +
      "In Supabase: SQL Editor → New query → paste and run `supabase/schema.sql` from this project, then tap Try again."
    );
  }
  return message;
}

function getWeekKey(): string {
  const now = new Date();
  const first = new Date(now.getFullYear(), 0, 1);
  const dayMs = 24 * 60 * 60 * 1000;
  const week = Math.ceil((((now.getTime() - first.getTime()) / dayMs) + first.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${week}`;
}

function getCalendarDayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function mapDbRole(value: unknown): Role {
  if (value === "driver" || value === "admin" || value === "restaurant" || value === "customer") {
    return value;
  }
  return "customer";
}

function mapProfileChangeRequestRow(row: Record<string, unknown>): ProfileChangeRequest | null {
  const id = row.id != null ? String(row.id) : null;
  const userId = row.user_id != null ? String(row.user_id) : null;
  const rr = row.requested_role;
  const requestedRole: ProfileRequestableRole | null =
    rr === "driver" || rr === "restaurant" ? rr : null;
  const st = row.status;
  const status =
    st === "pending" || st === "approved" || st === "rejected" ? st : null;
  if (!id || !userId || !requestedRole || !status) return null;
  let requesterFullName: string | null = null;
  const flatFn = row.full_name;
  if (typeof flatFn === "string" && flatFn.trim()) {
    requesterFullName = flatFn.trim();
  } else {
    const nested = row.profiles;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const fn = (nested as { full_name?: unknown }).full_name;
      requesterFullName = typeof fn === "string" ? fn.trim() || null : null;
    }
  }
  return {
    id,
    userId,
    requestedRole,
    status,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    resolvedAt: row.resolved_at != null && typeof row.resolved_at === "string" ? row.resolved_at : null,
    resolvedBy: row.resolved_by != null ? String(row.resolved_by) : null,
    requesterFullName,
  };
}

function mapOrderRow(row: Record<string, unknown>): OrderTicket {
  const rawItems = row.items;
  let items: CartItem[] = [];
  if (Array.isArray(rawItems)) {
    items = rawItems as CartItem[];
  } else if (typeof rawItems === "string") {
    try {
      items = JSON.parse(rawItems) as CartItem[];
    } catch {
      items = [];
    }
  }
  const st = typeof row.status === "string" ? row.status : "pending";
  const safeStatus: OrderStatus =
    st === "pending" ||
    st === "accepted" ||
    st === "driver_accepted" ||
    st === "picked_up" ||
    st === "completed"
      ? st
      : "pending";
  return {
    id: String(row.id),
    restaurantId: String(row.restaurant_id),
    customerUserId: row.customer_user_id != null ? String(row.customer_user_id) : null,
    customerLatitude: row.customer_latitude != null ? Number(row.customer_latitude) : null,
    customerLongitude: row.customer_longitude != null ? Number(row.customer_longitude) : null,
    items,
    total: Number(row.total_amount ?? 0),
    status: safeStatus,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    qrCode: row.qr_code != null ? String(row.qr_code) : null,
  };
}

async function persistProfileLocation(
  userId: string,
  location: { latitude: number; longitude: number },
  source: "gps" | "manual",
): Promise<void> {
  if (!supabase) return;
  if (profileLocationColumnsMissing) return;
  const { error } = await supabase
    .from("profiles")
    .update({
      last_latitude: location.latitude,
      last_longitude: location.longitude,
      location_source: source,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (isProfileLocationSchemaError(error)) {
    profileLocationColumnsMissing = true;
    return;
  }
  if (error) console.warn("[location profile update]", error.message);
}

async function loadProfileLocation(
  userId: string,
): Promise<{ location: { latitude: number; longitude: number } | null; source: "none" | "gps" | "manual" }> {
  if (!supabase) return { location: null, source: "none" };
  if (profileLocationColumnsMissing) return { location: null, source: "none" };
  const { data, error } = await supabase
    .from("profiles")
    .select("last_latitude, last_longitude, location_source")
    .eq("id", userId)
    .maybeSingle();
  if (isProfileLocationSchemaError(error)) {
    profileLocationColumnsMissing = true;
    return { location: null, source: "none" };
  }
  if (error || !data) return { location: null, source: "none" };
  const lat = data.last_latitude;
  const lng = data.last_longitude;
  const rawSource = data.location_source;
  const source = rawSource === "gps" || rawSource === "manual" ? rawSource : "none";
  if (lat == null || lng == null) return { location: null, source };
  return {
    location: { latitude: Number(lat), longitude: Number(lng) },
    source,
  };
}

function mapRestaurantFromDb(r: Record<string, unknown>): Restaurant {
  const mod = r.moderation_status;
  const moderationStatus =
    mod === "pending" || mod === "approved" || mod === "frozen" ? mod : "pending";
  return {
    id: String(r.id),
    name: typeof r.name === "string" ? r.name : "",
    cuisine: typeof r.cuisine === "string" && r.cuisine ? r.cuisine : "Unknown",
    address: typeof r.address === "string" ? r.address : "",
    latitude: r.latitude != null ? Number(r.latitude) : undefined,
    longitude: r.longitude != null ? Number(r.longitude) : undefined,
    isRecommended: Boolean(r.recommended_flag),
    weeklyVotes: Number(r.weekly_votes ?? 0),
    likeCount: Number(r.like_count ?? 0),
    ownerUserId: r.owner_user_id != null ? String(r.owner_user_id) : undefined,
    moderationStatus,
    reportCount: Number(r.report_count ?? 0),
  };
}

function normalizeMenuVideoUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "";
  if (!supabaseUrl) return value;
  const normalizedPath = value.replace(/^\/+/, "");
  return `${supabaseUrl}/storage/v1/object/public/menu-videos/${normalizedPath}`;
}

function extractMenuVideoStoragePath(videoUrl: string): string | null {
  const value = videoUrl.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    const publicMarker = "/storage/v1/object/public/menu-videos/";
    const signedMarker = "/storage/v1/object/sign/menu-videos/";
    const publicIdx = value.indexOf(publicMarker);
    if (publicIdx >= 0) return value.slice(publicIdx + publicMarker.length).split("?")[0];
    const signedIdx = value.indexOf(signedMarker);
    if (signedIdx >= 0) return value.slice(signedIdx + signedMarker.length).split("?")[0];
    return null;
  }
  return value.replace(/^\/+/, "");
}

function mapMenuItemFromDb(m: Record<string, unknown>): MenuItem {
  return {
    id: String(m.id),
    restaurantId: String(m.restaurant_id),
    title: typeof m.title === "string" ? m.title : "",
    description: typeof m.description === "string" ? m.description : "",
    price: Number(m.price ?? 0),
    videoUrl: normalizeMenuVideoUrl(m.video_url),
  };
}

function inferVideoContentType(name?: string, mimeType?: string): string | null {
  const mime = (mimeType ?? "").trim().toLowerCase();
  if (mime.startsWith("video/")) return mime;
  const lowerName = (name ?? "").trim().toLowerCase();
  if (lowerName.endsWith(".mp4")) return "video/mp4";
  if (lowerName.endsWith(".mov") || lowerName.endsWith(".qt")) return "video/quicktime";
  if (lowerName.endsWith(".webm")) return "video/webm";
  return null;
}

async function fetchUserProfile(userId: string, email: string | null): Promise<UserProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { full_name: string | null; role: unknown };
  return {
    id: userId,
    email,
    fullName: row.full_name ?? null,
    role: mapDbRole(row.role),
  };
}

/** Creates `public.profiles` when missing so FKs (e.g. order_tickets.customer_user_id) succeed. */
async function ensureProfileRowExists(userId: string, email: string | null, userMeta: Record<string, unknown> | undefined): Promise<UserProfile | null> {
  if (!supabase) return null;
  let profile = await fetchUserProfile(userId, email);
  if (profile) return profile;

  const meta = userMeta && typeof userMeta === "object" ? userMeta : {};
  const rawName = typeof meta.full_name === "string" ? meta.full_name : "";
  const fullName = rawName.trim() || (email ? email.split("@")[0] : "") || "";

  const { error: insertError } = await supabase.from("profiles").insert({
    id: userId,
    full_name: fullName,
    role: "customer",
  });
  if (insertError && insertError.code !== "23505") {
    console.warn("[profiles] Could not create profile row:", insertError.message);
    return null;
  }
  profile = await fetchUserProfile(userId, email);
  return profile;
}

const CUSTOMER_DAILY_RESTAURANT_KEY = "customerDailyRestaurantActions";
const CUSTOMER_LIKED_RESTAURANTS_KEY = "customerLikedRestaurantIds";
let profileLocationColumnsMissing = false;

function isProfileLocationSchemaError(
  error: { message?: string | null; code?: string | null } | null,
): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  if (
    message.includes("last_latitude") ||
    message.includes("last_longitude") ||
    message.includes("location_source")
  ) {
    return true;
  }
  return error.code === "PGRST204" || error.code === "42703";
}

async function loadCustomerLikedRestaurantIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOMER_LIKED_RESTAURANTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]).filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Older builds stored likes inside the daily blob; move them once to `customerLikedRestaurantIds`. */
async function migrateLegacyDailyLikesToSeparateStore(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOMER_DAILY_RESTAURANT_KEY);
    if (!raw) return;
    const p = JSON.parse(raw) as {
      date?: string;
      reportedRestaurantIds?: string[];
      likedRestaurantIds?: string[];
    };
    if (!Array.isArray(p.likedRestaurantIds) || p.likedRestaurantIds.length === 0) return;

    const existingLiked = await loadCustomerLikedRestaurantIds();
    const merged = [...new Set([...existingLiked, ...p.likedRestaurantIds])];
    await AsyncStorage.setItem(CUSTOMER_LIKED_RESTAURANTS_KEY, JSON.stringify(merged));

    const today = getCalendarDayKey();
    const reportsStillValid =
      p.date === today && Array.isArray(p.reportedRestaurantIds) ? p.reportedRestaurantIds : [];
    await AsyncStorage.setItem(
      CUSTOMER_DAILY_RESTAURANT_KEY,
      JSON.stringify({ date: today, reportedRestaurantIds: reportsStillValid }),
    );
  } catch {
    // ignore corrupt storage
  }
}

async function loadCustomerDailyRestaurantActions(): Promise<CustomerDailyRestaurantActions> {
  const today = getCalendarDayKey();
  try {
    const raw = await AsyncStorage.getItem(CUSTOMER_DAILY_RESTAURANT_KEY);
    if (!raw) {
      return { date: today, reportedRestaurantIds: [] };
    }
    const parsed = JSON.parse(raw) as CustomerDailyRestaurantActions & { likedRestaurantIds?: string[] };
    if (!parsed || typeof parsed !== "object") {
      return { date: today, reportedRestaurantIds: [] };
    }
    if (parsed.date !== today) {
      return { date: today, reportedRestaurantIds: [] };
    }
    return {
      date: parsed.date,
      reportedRestaurantIds: Array.isArray(parsed.reportedRestaurantIds)
        ? parsed.reportedRestaurantIds
        : [],
    };
  } catch {
    return { date: today, reportedRestaurantIds: [] };
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const hasSupabaseAuth = useMemo(() => Boolean(supabase), []);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() => (hasSupabaseAuth ? "loading" : "guest"));
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [role, setRoleState] = useState<Role>("customer");
  const [activeRestaurantId, setActiveRestaurantId] = useState<string | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<OrderTicket[]>([]);
  const [customerLocation, setCustomerLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
    name: string;
  } | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [locationPermission, setLocationPermission] = useState<"undetermined" | "granted" | "denied">(
    "undetermined",
  );
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSource, setLocationSource] = useState<"none" | "gps" | "manual">("none");
  const [hasVotedThisWeek, setHasVotedThisWeek] = useState(false);
  const [customerDailyRestaurantActions, setCustomerDailyRestaurantActions] =
    useState<CustomerDailyRestaurantActions>({
      date: getCalendarDayKey(),
      reportedRestaurantIds: [],
    });
  const [customerLikedRestaurantIds, setCustomerLikedRestaurantIds] = useState<string[]>([]);
  const [supabaseConnection, setSupabaseConnection] = useState<SupabaseConnectionState>({
    status: "checking",
  });
  const [loadToken, setLoadToken] = useState(0);
  const [myPendingProfileChangeRequest, setMyPendingProfileChangeRequest] = useState<ProfileChangeRequest | null>(
    null,
  );
  const [pendingProfileChangeRequestsForAdmin, setPendingProfileChangeRequestsForAdmin] = useState<
    ProfileChangeRequest[]
  >([]);
  const roleRef = useRef<Role>(role);
  const signedVideoUrlCacheRef = useRef<Record<string, string>>({});
  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    if (!supabase) {
      setAuthStatus("guest");
      setSession(null);
      setUserProfile(null);
      return;
    }

    let cancelled = false;

    async function syncFromSession(nextSession: Session | null) {
      if (cancelled) return;
      if (nextSession?.user) {
        setAuthStatus("loading");
      }
      setSession(nextSession);
      if (nextSession?.user) {
        const email = nextSession.user.email ?? null;
        let profile = await fetchUserProfile(nextSession.user.id, email);
        if (cancelled) return;
        if (!profile) {
          profile = await ensureProfileRowExists(
            nextSession.user.id,
            email,
            nextSession.user.user_metadata as Record<string, unknown> | undefined,
          );
        }
        if (cancelled) return;
        if (profile) {
          setUserProfile(profile);
          setRoleState(profile.role);
        } else {
          setUserProfile({
            id: nextSession.user.id,
            email,
            fullName: null,
            role: "customer",
          });
          setRoleState("customer");
        }
        setAuthStatus("signed_in");
        const profileLocation = await loadProfileLocation(nextSession.user.id);
        if (profileLocation.location) {
          setCustomerLocation(profileLocation.location);
          setUserLocation({
            latitude: profileLocation.location.latitude,
            longitude: profileLocation.location.longitude,
            name: "Saved location",
          });
          setLocationSource(profileLocation.source === "none" ? "manual" : profileLocation.source);
          setLocationStatus("granted");
        }
      } else {
        setUserProfile(null);
        setRoleState("customer");
        setAuthStatus("guest");
        setOrders([]);
        setMyPendingProfileChangeRequest(null);
        setPendingProfileChangeRequestsForAdmin([]);
        setLocationSource("none");
        setLocationStatus("idle");
        setUserLocation(null);
      }
    }

    void supabase.auth.getSession().then(({ data: { session: s } }) => void syncFromSession(s));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      void syncFromSession(s);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [hasSupabaseAuth]);

  const setRole = useCallback(
    (next: Role) => {
      if (hasSupabaseAuth && session) return;
      setRoleState(next);
    },
    [hasSupabaseAuth, session],
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      if (!supabase) return { ok: false, reason: "Supabase is not configured." };
      const trimmed = email.trim();
      if (!trimmed || !password) return { ok: false, reason: "Email and password are required." };
      const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
      if (error) return { ok: false, reason: error.message };
      return { ok: true };
    },
    [],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
    ): Promise<{ ok: true; needsEmailConfirmation: boolean } | { ok: false; reason: string }> => {
      if (!supabase) return { ok: false, reason: "Supabase is not configured." };
      const trimmedEmail = email.trim();
      if (!trimmedEmail || !password) return { ok: false, reason: "Email and password are required." };
      if (password.length < 6) return { ok: false, reason: "Password must be at least 6 characters." };
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: { data: { full_name: fullName.trim() } },
      });
      if (error) return { ok: false, reason: error.message };
      const needsEmailConfirmation = data.user != null && data.session == null;
      return { ok: true, needsEmailConfirmation };
    },
    [],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const updateProfile = useCallback(
    async (fullName: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      if (!supabase || !session?.user) return { ok: false, reason: "You must be signed in." };
      const name = fullName.trim();
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: name, updated_at: new Date().toISOString() })
        .eq("id", session.user.id);
      if (error) return { ok: false, reason: error.message };
      setUserProfile((prev) =>
        prev && prev.id === session.user.id ? { ...prev, fullName: name || null } : prev,
      );
      return { ok: true };
    },
    [session],
  );

  const refreshUserProfile = useCallback(async () => {
    if (!supabase || !session?.user) return;
    const email = session.user.email ?? null;
    const profile = await fetchUserProfile(session.user.id, email);
    if (profile) {
      setUserProfile(profile);
      setRoleState(profile.role);
    }
    const profileLocation = await loadProfileLocation(session.user.id);
    if (profileLocation.location) {
      setCustomerLocation(profileLocation.location);
      setUserLocation({
        latitude: profileLocation.location.latitude,
        longitude: profileLocation.location.longitude,
        name: "Saved location",
      });
      setLocationSource(profileLocation.source === "none" ? "manual" : profileLocation.source);
      setLocationStatus("granted");
    }
  }, [session]);

  const refreshMyProfileChangeRequest = useCallback(async () => {
    if (!supabase || !session?.user) {
      setMyPendingProfileChangeRequest(null);
      return;
    }
    const { data, error } = await supabase
      .from("profile_change_requests")
      .select("id, user_id, requested_role, status, created_at, resolved_at, resolved_by")
      .eq("user_id", session.user.id)
      .eq("status", "pending")
      .maybeSingle();
    if (error) {
      console.warn("[profile_change_requests]", error.message);
      setMyPendingProfileChangeRequest(null);
      return;
    }
    if (!data) {
      setMyPendingProfileChangeRequest(null);
      return;
    }
    const mapped = mapProfileChangeRequestRow(data as Record<string, unknown>);
    setMyPendingProfileChangeRequest(mapped);
  }, [session]);

  const refreshAdminProfileChangeRequests = useCallback(async () => {
    if (!supabase) {
      setPendingProfileChangeRequestsForAdmin([]);
      return;
    }
    const { data, error } = await supabase
      .from("profile_change_requests")
      .select("id, user_id, requested_role, status, created_at, resolved_at, resolved_by")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[profile_change_requests admin]", error.message);
      setPendingProfileChangeRequestsForAdmin([]);
      return;
    }
    const rawRows = (data ?? []) as Record<string, unknown>[];
    const userIds = [
      ...new Set(
        rawRows.map((r) => (r.user_id != null ? String(r.user_id) : "")).filter((id): id is string => Boolean(id)),
      ),
    ];
    const nameByUserId: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profRows, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      if (!profErr && profRows) {
        for (const p of profRows as { id?: unknown; full_name?: unknown }[]) {
          const pid = p.id != null ? String(p.id) : "";
          if (!pid) continue;
          nameByUserId[pid] = typeof p.full_name === "string" ? p.full_name.trim() : "";
        }
      }
    }
    setPendingProfileChangeRequestsForAdmin(
      rawRows
        .map((r) => {
          const uid = r.user_id != null ? String(r.user_id) : "";
          const name = uid ? nameByUserId[uid] : "";
          return mapProfileChangeRequestRow(
            name ? { ...r, full_name: name } : r,
          );
        })
        .filter((x): x is ProfileChangeRequest => x != null),
    );
  }, []);

  const refreshCatalogFromSupabase = useCallback(async () => {
    if (!supabase) return;
    try {
      const [{ data: restaurantRows, error: restaurantError }, { data: menuRows, error: menuError }] =
        await Promise.all([
          supabase.from("restaurants").select("*").limit(50),
          supabase.from("menu_items").select("*").limit(200),
        ]);
      if (restaurantError || menuError) {
        console.warn("[Supabase] Catalog refresh:", restaurantError?.message ?? menuError?.message);
        return;
      }
      if (Array.isArray(restaurantRows)) {
        setRestaurants(
          (restaurantRows as Record<string, unknown>[]).map((row) => mapRestaurantFromDb(row)),
        );
      }
      if (Array.isArray(menuRows)) {
        setMenuItems((menuRows as Record<string, unknown>[]).map((row) => mapMenuItemFromDb(row)));
      }
    } catch (e) {
      console.warn("[Supabase] Catalog refresh failed:", e);
    }
  }, [supabase]);

  const resolveVideoPlaybackUrl = useCallback(
    async (videoUrl: string): Promise<string> => {
      const raw = videoUrl.trim();
      if (!raw || !supabase) return raw;
      if (raw.includes("res.cloudinary.com")) return raw;
      const cached = signedVideoUrlCacheRef.current[raw];
      if (cached) return cached;
      const objectPath = extractMenuVideoStoragePath(raw);
      if (!objectPath) return raw;
      const { data, error } = await supabase.storage.from("menu-videos").createSignedUrl(objectPath, 60 * 60);
      if (error || !data?.signedUrl) return raw;
      signedVideoUrlCacheRef.current[raw] = data.signedUrl;
      return data.signedUrl;
    },
    [supabase],
  );

  const submitProfileChangeRequest = useCallback(
    async (
      requestedRole: ProfileRequestableRole,
    ): Promise<{ ok: true } | { ok: false; reason: string }> => {
      if (!supabase || !session?.user) return { ok: false, reason: "You must be signed in." };
      if (role !== "customer") {
        return { ok: false, reason: "Only customers can request a role change." };
      }
      const { error } = await supabase.from("profile_change_requests").insert({
        user_id: session.user.id,
        requested_role: requestedRole,
        status: "pending",
      });
      if (error) {
        if (error.code === "23505") {
          return { ok: false, reason: "You already have a pending request." };
        }
        return { ok: false, reason: formatSupabaseSetupError(error.message, error.code) };
      }
      await refreshMyProfileChangeRequest();
      return { ok: true };
    },
    [refreshMyProfileChangeRequest, role, session, supabase],
  );

  const resolveProfileChangeRequest = useCallback(
    async (
      requestId: string,
      action: "approve" | "reject",
    ): Promise<{ ok: true } | { ok: false; reason: string }> => {
      if (!supabase) return { ok: false, reason: "Supabase is not configured." };
      if (role !== "admin") return { ok: false, reason: "Only admins can resolve requests." };
      const { data, error } = await supabase.rpc("admin_resolve_profile_change_request", {
        p_request_id: requestId,
        p_action: action,
      });
      if (error) return { ok: false, reason: error.message };
      const payload = data as { ok?: boolean; error?: string } | null;
      if (!payload || typeof payload !== "object") {
        return { ok: false, reason: "Unexpected response from server." };
      }
      if (!payload.ok) {
        const code = payload.error;
        if (code === "not_admin") return { ok: false, reason: "You are not an admin." };
        if (code === "not_found") return { ok: false, reason: "Request not found." };
        if (code === "not_pending") return { ok: false, reason: "This request was already handled." };
        if (code === "bad_action") return { ok: false, reason: "Invalid action." };
        return { ok: false, reason: "Could not update request." };
      }
      await refreshAdminProfileChangeRequests();
      return { ok: true };
    },
    [refreshAdminProfileChangeRequests, role, supabase],
  );

  useEffect(() => {
    if (!supabase || !session?.user) {
      setMyPendingProfileChangeRequest(null);
      return;
    }
    if (role !== "customer") {
      setMyPendingProfileChangeRequest(null);
      return;
    }
    void refreshMyProfileChangeRequest();
  }, [refreshMyProfileChangeRequest, role, session?.user?.id, supabase]);

  useEffect(() => {
    if (!supabase || !session?.user) {
      setPendingProfileChangeRequestsForAdmin([]);
      return;
    }
    if (role !== "admin") {
      setPendingProfileChangeRequestsForAdmin([]);
      return;
    }
    void refreshAdminProfileChangeRequests();
  }, [refreshAdminProfileChangeRequests, role, session?.user?.id, supabase]);

  const refreshSupabase = useCallback(() => {
    setSupabaseConnection({ status: "checking" });
    setLoadToken((t) => t + 1);
  }, []);

  const refreshLocation = useCallback(async () => {
    setLocationStatus("loading");
    setLocationError(null);
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        perm = await Location.requestForegroundPermissionsAsync();
      }
      if (perm.status !== "granted") {
        setLocationPermission("denied");
        setLocationStatus("denied");
        if (locationSource !== "manual") {
          setCustomerLocation(null);
          setUserLocation(null);
          setLocationSource("none");
        }
        return;
      }
      setLocationPermission("granted");

      let position: Location.LocationObject | null = await Location.getLastKnownPositionAsync({
        maxAge: 120_000,
        requiredAccuracy: 2500,
      });
      if (!position) {
        position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          mayShowUserSettingsDialog: Platform.OS === "android",
        });
      }
      setCustomerLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      let locationName = "Current location";
      try {
        const reverse = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        const first = reverse[0];
        const candidate = [first?.district, first?.city, first?.subregion, first?.region].find(
          (v) => typeof v === "string" && v.trim().length > 0,
        );
        if (candidate) locationName = candidate;
      } catch {
        // Keep generic fallback label.
      }
      setUserLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        name: locationName,
      });
      setLocationSource("gps");
      setLocationStatus("granted");
      if (session?.user?.id) {
        await persistProfileLocation(
          session.user.id,
          {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          "gps",
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not read location.";
      console.warn("[location]", msg);
      setLocationError(msg);
      setCustomerLocation(null);
      setUserLocation(null);
      setLocationSource("none");
      setLocationStatus("idle");
    }
  }, [locationSource, session?.user?.id]);

  const setManualLocation = useCallback(
    async (
      latitude: number,
      longitude: number,
    ): Promise<{ ok: true } | { ok: false; reason: string }> => {
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        return { ok: false, reason: "Latitude must be between -90 and 90." };
      }
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return { ok: false, reason: "Longitude must be between -180 and 180." };
      }
      const next = { latitude, longitude };
      setCustomerLocation(next);
      setUserLocation({ ...next, name: "Manual location" });
      setLocationSource("manual");
      setLocationError(null);
      setLocationStatus("granted");
      if (session?.user?.id) {
        await persistProfileLocation(session.user.id, next, "manual");
      }
      return { ok: true };
    },
    [session?.user?.id],
  );

  useEffect(() => {
    async function bootstrap() {
      setSupabaseConnection({ status: "checking" });

      await migrateLegacyDailyLikesToSeparateStore();
      const [voteKey, dailyActions, likedIds] = await Promise.all([
        AsyncStorage.getItem("voteWeekKey"),
        loadCustomerDailyRestaurantActions(),
        loadCustomerLikedRestaurantIds(),
      ]);
      setHasVotedThisWeek(voteKey === getWeekKey());
      setCustomerDailyRestaurantActions(dailyActions);
      setCustomerLikedRestaurantIds(likedIds);

      if (!supabase) {
        setRestaurants(mockRestaurants);
        setMenuItems(mockMenuItems);
        setSupabaseConnection({
          status: "demo",
          hint: isOfflineDemoForced
            ? "Offline demo (EXPO_PUBLIC_OFFLINE_DEMO=1): mock data only. Use Account → role chips to preview driver, admin, and restaurant. No login."
            : "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY in `.env` or `.env.local`, then restart Expo.",
        });
        return;
      }

      const probe = await supabase.from("restaurants").select("id").limit(1);
      if (probe.error) {
        console.warn("[Supabase] Connection check failed:", probe.error.message);
        setRestaurants(mockRestaurants);
        setMenuItems(mockMenuItems);
        setSupabaseConnection({
          status: "error",
          message: formatSupabaseSetupError(probe.error.message, probe.error.code),
        });
        return;
      }

      const [{ data: restaurantRows, error: restaurantError }, { data: menuRows, error: menuError }] =
        await Promise.all([
          supabase.from("restaurants").select("*").limit(50),
          supabase.from("menu_items").select("*").limit(200),
        ]);

      if (restaurantError || menuError) {
        console.warn(
          "[Supabase] Falling back to mock data:",
          restaurantError?.message ?? menuError?.message,
        );
        setRestaurants(mockRestaurants);
        setMenuItems(mockMenuItems);
        setSupabaseConnection({
          status: "error",
          message: formatSupabaseSetupError(
            restaurantError?.message ?? menuError?.message ?? "Unknown error",
            restaurantError?.code ?? menuError?.code ?? null,
          ),
        });
        return;
      }

      if (restaurantRows && menuRows) {
        setRestaurants(
          (restaurantRows as Record<string, unknown>[]).map((r) => mapRestaurantFromDb(r)),
        );
        setMenuItems((menuRows as Record<string, unknown>[]).map((m) => mapMenuItemFromDb(m)));
        setSupabaseConnection({ status: "connected" });
      } else {
        setRestaurants(mockRestaurants);
        setMenuItems(mockMenuItems);
        setSupabaseConnection({
          status: "error",
          message: "Empty response from Supabase.",
        });
      }
    }

    void bootstrap();
  }, [loadToken, authStatus, session?.user?.id, role]);

  useEffect(() => {
    void refreshLocation();
  }, [refreshLocation]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") void refreshLocation();
    });
    return () => sub.remove();
  }, [refreshLocation]);

  useEffect(() => {
    if (!supabase || authStatus !== "signed_in") return;
    const tick = () => {
      void refreshUserProfile();
      void refreshCatalogFromSupabase();
      void refreshMyProfileChangeRequest();
      if (roleRef.current === "admin") void refreshAdminProfileChangeRequests();
    };
    void tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [
    authStatus,
    refreshAdminProfileChangeRequests,
    refreshCatalogFromSupabase,
    refreshMyProfileChangeRequest,
    refreshUserProfile,
    supabase,
  ]);

  useEffect(() => {
    if (restaurants.length === 0) {
      setActiveRestaurantId(null);
      return;
    }
    setActiveRestaurantId((prev) => {
      if (prev && restaurants.some((restaurant) => restaurant.id === prev)) {
        return prev;
      }
      return restaurants[0].id;
    });
  }, [restaurants]);

  useEffect(() => {
    if (role !== "restaurant" || !session?.user?.id) return;
    const owned = restaurants.filter((r) => r.ownerUserId === session.user.id);
    if (owned.length === 0) return;
    setActiveRestaurantId((prev) => {
      if (prev && owned.some((o) => o.id === prev)) return prev;
      return owned[0].id;
    });
  }, [role, session?.user?.id, restaurants]);

  const distanceToRestaurantKm = useCallback(
    (restaurant: Restaurant): number | null => {
      if (!customerLocation || restaurant.latitude == null || restaurant.longitude == null) {
        return null;
      }

      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const earthKm = 6371;
      const dLat = toRad(restaurant.latitude - customerLocation.latitude);
      const dLon = toRad(restaurant.longitude - customerLocation.longitude);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(customerLocation.latitude)) *
          Math.cos(toRad(restaurant.latitude)) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return earthKm * c;
    },
    [customerLocation],
  );

  const addRestaurant = useCallback(
    async (input: {
      name: string;
      cuisine: string;
      address: string;
      latitude?: number;
      longitude?: number;
    }): Promise<{ ok: true } | { ok: false; reason: string }> => {
      const name = input.name.trim();
      if (!name) return { ok: false, reason: "Restaurant name is required." };

      if (supabase && session?.user?.id) {
        if (role !== "restaurant") {
          return {
            ok: false,
            reason:
              "Only accounts with the restaurant role can register a venue. Request access from Account while signed in as a customer, then wait for admin approval.",
          };
        }
        if (restaurants.some((r) => r.ownerUserId === session.user.id)) {
          return {
            ok: false,
            reason: "This account already has a restaurant. One venue per operator account.",
          };
        }
      }

      const ownerId = session?.user?.id ?? null;
      const localRestaurant: Restaurant = {
        id: `local-${Date.now()}`,
        name,
        cuisine: input.cuisine.trim() || "Unknown",
        address: input.address.trim(),
        latitude: input.latitude,
        longitude: input.longitude,
        weeklyVotes: 0,
        isRecommended: false,
        moderationStatus: "pending",
        reportCount: 0,
        likeCount: 0,
        ownerUserId: ownerId ?? undefined,
      };

      // Keep setup friction low before auth/owner flow is in place.
      setRestaurants((prev) => [localRestaurant, ...prev]);

      if (supabase) {
        const { data: inserted, error } = await supabase
          .from("restaurants")
          .insert({
            name: localRestaurant.name,
            cuisine: localRestaurant.cuisine,
            address: localRestaurant.address,
            latitude: localRestaurant.latitude ?? null,
            longitude: localRestaurant.longitude ?? null,
            weekly_votes: 0,
            recommended_flag: false,
            like_count: 0,
            owner_user_id: ownerId,
            moderation_status: "pending",
            report_count: 0,
          })
          .select("id")
          .single();
        if (error) {
          setRestaurants((prev) => prev.filter((row) => row.id !== localRestaurant.id));
          return {
            ok: false,
            reason: `Could not save restaurant: ${error.message}`,
          };
        }
        const serverId =
          inserted && typeof (inserted as { id?: unknown }).id === "string"
            ? (inserted as { id: string }).id
            : null;
        if (serverId) {
          setRestaurants((prev) =>
            prev.map((row) =>
              row.id === localRestaurant.id
                ? { ...row, id: serverId, moderationStatus: "pending" as const }
                : row,
            ),
          );
        }
      }

      return { ok: true };
    },
    [restaurants, role, session?.user?.id, supabase],
  );

  const updateRestaurant = useCallback(
    async (
      restaurantId: string,
      input: {
        name: string;
        cuisine: string;
        address: string;
        latitude?: number;
        longitude?: number;
      },
    ): Promise<{ ok: true } | { ok: false; reason: string }> => {
      const name = input.name.trim();
      if (!name) return { ok: false, reason: "Restaurant name is required." };

      setRestaurants((prev) =>
        prev.map((restaurant) =>
          restaurant.id === restaurantId
            ? {
                ...restaurant,
                name,
                cuisine: input.cuisine.trim() || "Unknown",
                address: input.address.trim(),
                latitude: input.latitude,
                longitude: input.longitude,
              }
            : restaurant,
        ),
      );

      if (supabase && !restaurantId.startsWith("local-")) {
        const { error } = await supabase
          .from("restaurants")
          .update({
            name,
            cuisine: input.cuisine.trim() || "Unknown",
            address: input.address.trim(),
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
          })
          .eq("id", restaurantId);
        if (error) {
          return { ok: false, reason: "Updated locally, but Supabase update failed." };
        }
      }

      return { ok: true };
    },
    [supabase],
  );

  const deleteRestaurant = useCallback(
    async (restaurantId: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      if (role !== "admin") {
        return { ok: false, reason: "Only admin can delete restaurants." };
      }
      const restaurant = restaurants.find((item) => item.id === restaurantId);
      if (!restaurant) return { ok: false, reason: "Restaurant not found." };
      if (restaurant.reportCount === 0) {
        return { ok: false, reason: "Delete is allowed only for reported restaurants." };
      }

      setRestaurants((prev) => prev.filter((restaurant) => restaurant.id !== restaurantId));
      setMenuItems((prev) => prev.filter((item) => item.restaurantId !== restaurantId));
      setOrders((prev) => prev.filter((order) => order.restaurantId !== restaurantId));
      setCartItems((prev) =>
        prev.filter((cart) => {
          const menuItem = menuItems.find((item) => item.id === cart.menuItemId);
          return menuItem ? menuItem.restaurantId !== restaurantId : false;
        }),
      );

      if (supabase && !restaurantId.startsWith("local-")) {
        const { error } = await supabase.from("restaurants").delete().eq("id", restaurantId);
        if (error) {
          return { ok: false, reason: "Deleted locally, but Supabase delete failed." };
        }
      }

      return { ok: true };
    },
    [menuItems, restaurants, role, supabase],
  );

  const totalPrice = useMemo(() => {
    return cartItems.reduce((sum, cartItem) => {
      const menuItem = menuItems.find((m) => m.id === cartItem.menuItemId);
      if (!menuItem) return sum;
      return sum + menuItem.price * cartItem.quantity;
    }, 0);
  }, [cartItems, menuItems]);

  const refreshOrders = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("order_tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      console.warn("[Supabase] Failed to load orders:", error.message);
      return;
    }
    setOrders((data ?? []).map((row) => mapOrderRow(row as Record<string, unknown>)));
  }, [supabase]);

  useEffect(() => {
    if (!supabase || authStatus !== "signed_in") return;
    void refreshOrders();
    const interval = setInterval(() => void refreshOrders(), 5000);
    return () => clearInterval(interval);
  }, [supabase, authStatus, refreshOrders]);

  const addMenuItem = useCallback(
    async (input: {
      restaurantId: string;
      title: string;
      description: string;
      price: number;
      videoUrl?: string;
      videoFile?: {
        uri: string;
        name?: string;
        mimeType?: string;
        byteSize?: number;
        webFile?: Blob;
      };
    }): Promise<{ ok: true } | { ok: false; reason: string }> => {
      const title = input.title.trim();
      if (!title) return { ok: false, reason: "Menu item title is required." };

      const canManageAsAdmin = role === "admin";
      const canManageAsRestaurant =
        role === "restaurant" &&
        activeRestaurantId != null &&
        input.restaurantId === activeRestaurantId;
      if (!canManageAsAdmin && !canManageAsRestaurant) {
        return { ok: false, reason: "You can only manage menu for your assigned restaurant." };
      }

      let resolvedVideoUrl = input.videoUrl?.trim() ?? "";
      if (!input.videoFile && !resolvedVideoUrl) {
        return { ok: false, reason: "Menu item video is required." };
      }

      if (input.videoFile) {
        const inferredContentType = inferVideoContentType(input.videoFile.name, input.videoFile.mimeType);
        if (!inferredContentType) {
          return {
            ok: false,
            reason:
              "Unsupported video format. Please upload MP4 (recommended), MOV, or WEBM with a valid video MIME type.",
          };
        }
        const safeName = (input.videoFile.name ?? "menu-video.mp4").replace(/\s+/g, "-");
        const safeNameWithExt =
          /\.[a-z0-9]+$/i.test(safeName)
            ? safeName
            : inferredContentType === "video/quicktime"
              ? `${safeName}.mov`
              : inferredContentType === "video/webm"
                ? `${safeName}.webm`
                : `${safeName}.mp4`;
        if (Platform.OS === "web" && !input.videoFile.webFile) {
          return {
            ok: false,
            reason:
              "Web picker did not provide a file object. Re-select the video from your device and try again.",
          };
        }
        const blob =
          input.videoFile.webFile ?? (await fetch(input.videoFile.uri).then((res) => res.blob()));
        if (!blob || blob.size <= 0) {
          return {
            ok: false,
            reason: "Selected video file is empty. Please pick another file and try again.",
          };
        }
        // On web, third-party tracking prevention can block Cloudinary playback.
        // Prefer first-party Supabase storage for browser uploads.
        const useCloudinaryUpload = isCloudinaryConfigured() && Platform.OS !== "web";
        if (useCloudinaryUpload) {
          try {
            resolvedVideoUrl = await uploadVideoToCloudinary({
              uri: input.videoFile.uri,
              name: safeNameWithExt,
              mimeType: inferredContentType ?? blob.type ?? "video/mp4",
              webFile: input.videoFile.webFile,
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Cloudinary upload failed.";
            return {
              ok: false,
              reason: msg,
            };
          }
        } else {
          if (!supabase) {
            return { ok: false, reason: "Supabase is required to upload menu videos." };
          }
          const uid = session?.user?.id;
          if (!uid) {
            return { ok: false, reason: "Sign in to upload menu videos." };
          }
          // Storage RLS: first path segment must be auth.uid() (see schema storage policies).
          const objectPath = `${uid}/${input.restaurantId}/${Date.now()}-${safeNameWithExt}`;
          const { error: uploadError } = await supabase.storage.from("menu-videos").upload(objectPath, blob, {
            contentType: inferredContentType ?? blob.type ?? "video/mp4",
            upsert: false,
          });
          if (uploadError) {
            return { ok: false, reason: `Video upload failed: ${uploadError.message}` };
          }
          const { data } = supabase.storage.from("menu-videos").getPublicUrl(objectPath);
          resolvedVideoUrl = data.publicUrl;
        }
      }

      const item: MenuItem = {
        id: `mi-${Date.now()}`,
        restaurantId: input.restaurantId,
        title,
        description: input.description.trim(),
        price: input.price,
        videoUrl: resolvedVideoUrl,
      };
      setMenuItems((prev) => [item, ...prev]);

      if (supabase) {
        const { data: inserted, error } = await supabase
          .from("menu_items")
          .insert({
            restaurant_id: item.restaurantId,
            title: item.title,
            description: item.description,
            price: item.price,
            video_url: item.videoUrl,
          })
          .select("id")
          .single();
        if (error) {
          setMenuItems((prev) => prev.filter((row) => row.id !== item.id));
          return {
            ok: false,
            reason: `Could not save menu item: ${error.message}`,
          };
        }
        const serverId = inserted && typeof (inserted as { id?: unknown }).id === "string" ? (inserted as { id: string }).id : null;
        if (serverId) {
          setMenuItems((prev) =>
            prev.map((row) => (row.id === item.id ? { ...row, id: serverId } : row)),
          );
          setCartItems((prev) =>
            prev.map((c) => (c.menuItemId === item.id ? { ...c, menuItemId: serverId } : c)),
          );
        }
      }
      return { ok: true };
    },
    [activeRestaurantId, role, session?.user?.id, supabase],
  );

  const deleteMenuItem = useCallback(
    async (menuItemId: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      const target = menuItems.find((item) => item.id === menuItemId);
      if (!target) return { ok: false, reason: "Menu item not found." };

      const canManageAsAdmin = role === "admin";
      const canManageAsRestaurant =
        role === "restaurant" &&
        activeRestaurantId != null &&
        target.restaurantId === activeRestaurantId;
      if (!canManageAsAdmin && !canManageAsRestaurant) {
        return { ok: false, reason: "You can only manage menu for your assigned restaurant." };
      }

      setMenuItems((prev) => prev.filter((item) => item.id !== menuItemId));
      setCartItems((prev) => prev.filter((cart) => cart.menuItemId !== menuItemId));

      if (supabase && !menuItemId.startsWith("mi-")) {
        const { error } = await supabase.from("menu_items").delete().eq("id", menuItemId);
        if (error) return { ok: false, reason: "Deleted locally, but Supabase delete failed." };
      }
      return { ok: true };
    },
    [activeRestaurantId, menuItems, role, supabase],
  );


  const approveRestaurant = useCallback(
    async (restaurantId: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      if (role !== "admin") {
        return { ok: false, reason: "Only admin can approve restaurants." };
      }
      const restaurant = restaurants.find((item) => item.id === restaurantId);
      if (!restaurant) return { ok: false, reason: "Restaurant not found." };
      if (restaurant.moderationStatus !== "pending") {
        return { ok: false, reason: "Only pending restaurants can be approved." };
      }
      if (supabase && !restaurantId.startsWith("local-")) {
        const { error } = await supabase
          .from("restaurants")
          .update({ moderation_status: "approved", report_count: 0 })
          .eq("id", restaurantId);
        if (error) {
          return { ok: false, reason: error.message };
        }
      }
      setRestaurants((prev) =>
        prev.map((r) =>
          r.id === restaurantId ? { ...r, moderationStatus: "approved", reportCount: 0 } : r,
        ),
      );
      return { ok: true };
    },
    [restaurants, role, supabase],
  );

  const freezeRestaurant = useCallback(
    async (restaurantId: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      if (role !== "admin") {
        return { ok: false, reason: "Only admin can freeze restaurants." };
      }
      const restaurant = restaurants.find((item) => item.id === restaurantId);
      if (!restaurant) return { ok: false, reason: "Restaurant not found." };
      if (restaurant.reportCount === 0) {
        return { ok: false, reason: "Freeze is allowed only for reported restaurants." };
      }
      if (supabase && !restaurantId.startsWith("local-")) {
        const { error } = await supabase
          .from("restaurants")
          .update({ moderation_status: "frozen" })
          .eq("id", restaurantId);
        if (error) {
          return { ok: false, reason: error.message };
        }
      }
      setRestaurants((prev) =>
        prev.map((item) => (item.id === restaurantId ? { ...item, moderationStatus: "frozen" } : item)),
      );
      return { ok: true };
    },
    [restaurants, role, supabase],
  );

  const reportRestaurant = useCallback(
    async (restaurantId: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      if (role !== "customer") {
        return { ok: false, reason: "Only customers can report restaurants." };
      }
      const exists = restaurants.some((r) => r.id === restaurantId);
      if (!exists) return { ok: false, reason: "Restaurant not found." };

      const disk = await loadCustomerDailyRestaurantActions();
      if (disk.reportedRestaurantIds.includes(restaurantId)) {
        return {
          ok: false,
          reason: "You already reported this restaurant today. You can report again tomorrow.",
        };
      }

      if (supabase && !restaurantId.startsWith("local-")) {
        const { error } = await supabase.rpc("increment_restaurant_report", {
          target_id: restaurantId,
        });
        if (error) {
          return { ok: false, reason: error.message };
        }
      }

      const next: CustomerDailyRestaurantActions = {
        ...disk,
        reportedRestaurantIds: [...disk.reportedRestaurantIds, restaurantId],
      };
      await AsyncStorage.setItem(CUSTOMER_DAILY_RESTAURANT_KEY, JSON.stringify(next));
      setCustomerDailyRestaurantActions(next);

      setRestaurants((prev) =>
        prev.map((restaurant) =>
          restaurant.id === restaurantId
            ? { ...restaurant, reportCount: restaurant.reportCount + 1 }
            : restaurant,
        ),
      );

      return { ok: true };
    },
    [restaurants, role, supabase],
  );

  const toggleRestaurantLike = useCallback(
    async (
      restaurantId: string,
    ): Promise<{ ok: true; liked: boolean } | { ok: false; reason: string }> => {
      if (role !== "customer") {
        return { ok: false, reason: "Only customers can like restaurants." };
      }
      const target = restaurants.find((r) => r.id === restaurantId);
      if (!target) return { ok: false, reason: "Restaurant not found." };
      if (target.moderationStatus !== "approved") {
        return { ok: false, reason: "Only approved restaurants can be liked." };
      }

      const likedIds = await loadCustomerLikedRestaurantIds();
      const isLiked = likedIds.includes(restaurantId);
      const delta = isLiked ? -1 : 1;
      const nextIds = isLiked ? likedIds.filter((id) => id !== restaurantId) : [...likedIds, restaurantId];
      const nextCount = Math.max(0, target.likeCount + delta);

      if (supabase && !restaurantId.startsWith("local-")) {
        const { error } = await supabase.rpc("adjust_restaurant_like_count", {
          target_id: restaurantId,
          p_delta: delta,
        });
        if (error) {
          return { ok: false, reason: error.message };
        }
      }

      await AsyncStorage.setItem(CUSTOMER_LIKED_RESTAURANTS_KEY, JSON.stringify(nextIds));
      setCustomerLikedRestaurantIds(nextIds);

      setRestaurants((prev) =>
        prev.map((restaurant) =>
          restaurant.id === restaurantId ? { ...restaurant, likeCount: nextCount } : restaurant,
        ),
      );

      return { ok: true, liked: !isLiked };
    },
    [restaurants, role, supabase],
  );

  function addToCart(menuItemId: string) {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.menuItemId === menuItemId);
      if (existing) {
        return prev.map((item) =>
          item.menuItemId === menuItemId ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...prev, { menuItemId, quantity: 1 }];
    });
  }

  function removeFromCart(menuItemId: string) {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.menuItemId === menuItemId);
      if (!existing) return prev;
      if (existing.quantity === 1) return prev.filter((item) => item.menuItemId !== menuItemId);
      return prev.map((item) =>
        item.menuItemId === menuItemId ? { ...item, quantity: item.quantity - 1 } : item,
      );
    });
  }

  const placeOrder = useCallback(async (): Promise<
    { ok: true; orderId: string } | { ok: false; reason: string }
  > => {
    if (restaurants.length === 0) {
      return { ok: false, reason: "No restaurants are registered yet. Ask admin to add one first." };
    }

    if (cartItems.length === 0) {
      return { ok: false, reason: "Your cart is empty." };
    }

    const firstItem = menuItems.find((item) => item.id === cartItems[0]?.menuItemId);
    if (!firstItem) {
      return { ok: false, reason: "Order items are not available right now." };
    }
    const targetRestaurant = restaurants.find((restaurant) => restaurant.id === firstItem.restaurantId);
    if (!targetRestaurant) {
      return { ok: false, reason: "This restaurant is not registered yet." };
    }
    if (targetRestaurant.moderationStatus !== "approved") {
      return { ok: false, reason: "This restaurant is not approved for orders right now." };
    }

    const hasMixedRestaurants = cartItems.some((cart) => {
      const menuItem = menuItems.find((item) => item.id === cart.menuItemId);
      return menuItem ? menuItem.restaurantId !== firstItem.restaurantId : false;
    });

    if (hasMixedRestaurants) {
      return { ok: false, reason: "Please order from one restaurant at a time." };
    }

    const total = cartItems.reduce((sum, cart) => {
      const menuItem = menuItems.find((item) => item.id === cart.menuItemId);
      if (!menuItem) return sum;
      return sum + menuItem.price * cart.quantity;
    }, 0);

    if (!customerLocation) {
      return {
        ok: false,
        reason:
          "Set your location first (GPS or manual) before placing an order so drivers can route to you.",
      };
    }

    if (supabase) {
      if (!session?.user?.id) {
        return { ok: false, reason: "Sign in to place an order." };
      }
      const ensured = await ensureProfileRowExists(
        session.user.id,
        session.user.email ?? null,
        session.user.user_metadata as Record<string, unknown> | undefined,
      );
      if (!ensured) {
        return {
          ok: false,
          reason:
            "Your account profile could not be created in the database. Ask an admin to run the latest schema.sql (profiles insert policy), then sign out and back in.",
        };
      }

      const itemsPayload = JSON.parse(JSON.stringify(cartItems)) as CartItem[];

      const insertPayload = {
        restaurant_id: firstItem.restaurantId,
        customer_user_id: session.user.id,
        total_amount: total,
        status: "pending",
        items: itemsPayload,
        customer_latitude: customerLocation.latitude,
        customer_longitude: customerLocation.longitude,
      };
      let data: { id?: unknown } | null = null;
      let error: { message: string; code?: string | null } | null = null;
      {
        const res = await supabase.from("order_tickets").insert(insertPayload).select("id").single();
        data = res.data as { id?: unknown } | null;
        error = res.error ? { message: res.error.message, code: res.error.code } : null;
      }
      // Older schemas may not have dropoff columns yet; keep order flow working.
      if (error?.code === "PGRST204" || error?.code === "42703") {
        const retry = await supabase
          .from("order_tickets")
          .insert({
            restaurant_id: firstItem.restaurantId,
            customer_user_id: session.user.id,
            total_amount: total,
            status: "pending",
            items: itemsPayload,
          })
          .select("id")
          .single();
        data = retry.data as { id?: unknown } | null;
        error = retry.error ? { message: retry.error.message, code: retry.error.code } : null;
      }
      if (error) {
        return {
          ok: false,
          reason: formatSupabaseSetupError(error.message, error.code ?? null),
        };
      }
      const orderId = String(data?.id ?? "");
      setCartItems([]);
      await refreshOrders();
      return { ok: true, orderId };
    }

    const orderId = `ord-${Date.now()}`;
    setOrders((prev) => [
      {
        id: orderId,
        restaurantId: firstItem.restaurantId,
        customerUserId: session?.user?.id ?? null,
        customerLatitude: customerLocation.latitude,
        customerLongitude: customerLocation.longitude,
        items: cartItems,
        total,
        status: "pending",
        createdAt: new Date().toISOString(),
        qrCode: null,
      },
      ...prev,
    ]);
    setCartItems([]);
    return { ok: true, orderId };
  }, [cartItems, customerLocation, menuItems, refreshOrders, restaurants, session?.user?.id, supabase]);

  const acceptOrder = useCallback(
    async (orderId: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      const targetOrder = orders.find((order) => order.id === orderId);
      if (!targetOrder) {
        return { ok: false, reason: "Order was not found." };
      }
      if (targetOrder.status !== "pending") {
        return { ok: false, reason: "Only pending orders can be accepted." };
      }

      const canAcceptAsAdmin = role === "admin";
      const canAcceptAsScopedRestaurant =
        role === "restaurant" &&
        activeRestaurantId != null &&
        targetOrder.restaurantId === activeRestaurantId;

      if (!canAcceptAsAdmin && !canAcceptAsScopedRestaurant) {
        return { ok: false, reason: "You can only accept orders for your assigned restaurant." };
      }

      const qrCode = `TR-${orderId.replace(/-/g, "").toUpperCase()}`;

      if (supabase && !orderId.startsWith("ord-")) {
        const { error } = await supabase
          .from("order_tickets")
          .update({ status: "accepted", qr_code: qrCode })
          .eq("id", orderId)
          .eq("status", "pending");
        if (error) {
          return { ok: false, reason: error.message };
        }
        await refreshOrders();
        return { ok: true };
      }

      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId && order.status === "pending"
            ? { ...order, status: "accepted", qrCode }
            : order,
        ),
      );
      return { ok: true };
    },
    [activeRestaurantId, orders, refreshOrders, role, supabase],
  );

  const pickupOrder = useCallback(
    async (orderId: string): Promise<void> => {
      if (supabase && !orderId.startsWith("ord-")) {
        const { error } = await supabase
          .from("order_tickets")
          .update({ status: "picked_up" })
          .eq("id", orderId)
          .eq("status", "driver_accepted");
        if (error) {
          console.warn("[pickupOrder]", error.message);
          return;
        }
        await refreshOrders();
        return;
      }
      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId && order.status === "driver_accepted"
            ? { ...order, status: "picked_up" }
            : order,
        ),
      );
    },
    [refreshOrders, supabase],
  );

  const acceptDelivery = useCallback(
    async (orderId: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      if (role !== "driver") {
        return { ok: false, reason: "Only drivers can accept deliveries." };
      }
      const target = orders.find((order) => order.id === orderId);
      if (!target) return { ok: false, reason: "Order was not found." };
      if (target.status !== "accepted") {
        return { ok: false, reason: "Only approved orders can be accepted by driver." };
      }

      if (supabase && !orderId.startsWith("ord-")) {
        const { error } = await supabase
          .from("order_tickets")
          .update({ status: "driver_accepted" })
          .eq("id", orderId)
          .eq("status", "accepted");
        if (error) {
          return { ok: false, reason: error.message };
        }
        await refreshOrders();
        return { ok: true };
      }

      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId ? { ...order, status: "driver_accepted" } : order,
        ),
      );
      return { ok: true };
    },
    [orders, refreshOrders, role, supabase],
  );

  async function voteForRestaurant(restaurantId: string) {
    if (hasVotedThisWeek) return;

    const weekKey = getWeekKey();
    await AsyncStorage.setItem("voteWeekKey", weekKey);
    setHasVotedThisWeek(true);

    if (supabase) {
      const { error: rpcError } = await supabase.rpc("increment_weekly_vote", {
        restaurant_id: restaurantId,
      });
      if (rpcError) {
        console.warn("[Supabase] Vote RPC failed:", rpcError.message);
      }
    }

    setRestaurants((prev) =>
      prev
        .map((restaurant) =>
          restaurant.id === restaurantId
            ? { ...restaurant, weeklyVotes: restaurant.weeklyVotes + 1 }
            : restaurant,
        )
        .sort((a, b) => b.weeklyVotes - a.weeklyVotes)
        .map((restaurant, index) => ({
          ...restaurant,
          isRecommended: index < 3,
        })),
    );
  }

  return (
    <AppContext.Provider
      value={{
        hasSupabaseAuth,
        authStatus,
        session,
        userProfile,
        role,
        activeRestaurantId,
        restaurants,
        menuItems,
        cartItems,
        orders,
        refreshOrders,
        customerLocation,
        userLocation,
        locationStatus,
        locationSource,
        locationPermission,
        locationError,
        hasVotedThisWeek,
        customerDailyRestaurantActions,
        customerLikedRestaurantIds,
        supabaseConnection,
        addToCart,
        removeFromCart,
        placeOrder,
        acceptOrder,
        acceptDelivery,
        pickupOrder,
        voteForRestaurant,
        totalPrice,
        refreshSupabase,
        setRole,
        signIn,
        signUp,
        signOut,
        updateProfile,
        refreshUserProfile,
        myPendingProfileChangeRequest,
        pendingProfileChangeRequestsForAdmin,
        refreshMyProfileChangeRequest,
        refreshAdminProfileChangeRequests,
        submitProfileChangeRequest,
        resolveProfileChangeRequest,
        setActiveRestaurantId,
        refreshLocation,
        setManualLocation,
        distanceToRestaurantKm,
        addRestaurant,
        approveRestaurant,
        freezeRestaurant,
        reportRestaurant,
        toggleRestaurantLike,
        updateRestaurant,
        deleteRestaurant,
        addMenuItem,
        deleteMenuItem,
        resolveVideoPlaybackUrl,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppData must be used inside AppProvider");
  }
  return context;
}
