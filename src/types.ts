export type Role = "customer" | "driver" | "admin" | "restaurant";

/** Roles a customer may request; admins approve in the dashboard. */
export type ProfileRequestableRole = "driver" | "restaurant";

export type ProfileChangeRequestStatus = "pending" | "approved" | "rejected";

export type ProfileChangeRequest = {
  id: string;
  userId: string;
  requestedRole: ProfileRequestableRole;
  status: ProfileChangeRequestStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  /** From joined `profiles` when loaded for admin. */
  requesterFullName: string | null;
};

export type AuthStatus = "loading" | "guest" | "signed_in";

export type UserProfile = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: Role;
};

export type Restaurant = {
  id: string;
  name: string;
  cuisine: string;
  address: string;
  /** Set when loaded from Supabase; used to scope restaurant staff to their venue. */
  ownerUserId?: string | null;
  latitude?: number;
  longitude?: number;
  isRecommended: boolean;
  weeklyVotes: number;
  /** Customer-facing like total (each customer can like until they unlike; stored locally per device). */
  likeCount: number;
  moderationStatus: "pending" | "approved" | "frozen";
  reportCount: number;
};

/** Persisted locally: which restaurants this customer already reported today (calendar day). */
export type CustomerDailyRestaurantActions = {
  date: string;
  reportedRestaurantIds: string[];
};

export type MenuItem = {
  id: string;
  restaurantId: string;
  title: string;
  description: string;
  price: number;
  videoUrl: string;
};

export type CartItem = {
  menuItemId: string;
  quantity: number;
};

export type OrderStatus = "pending" | "accepted" | "driver_accepted" | "picked_up" | "completed";

export type OrderTicket = {
  id: string;
  restaurantId: string;
  /** Present when loaded from Supabase; used to scope customer Account UI. */
  customerUserId?: string | null;
  customerLatitude?: number | null;
  customerLongitude?: number | null;
  items: CartItem[];
  total: number;
  status: OrderStatus;
  createdAt: string;
  qrCode: string | null;
};
