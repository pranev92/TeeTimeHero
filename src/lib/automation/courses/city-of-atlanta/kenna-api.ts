/**
 * Kenna/TeeItUp REST API client for City of Atlanta Golf.
 *
 * Reverse-engineered from browns-mill-fore-passholder.book.teeitup.golf
 * Base URL: https://phx-api-be-east-1b.kenna.io
 * All authenticated requests include:  session: <sessionToken>
 *                                       x-be-alias: <alias>
 */

const BASE = "https://phx-api-be-east-1b.kenna.io";

const DEFAULT_HEADERS = {
  "accept": "application/json, text/plain, */*",
  "content-type": "application/json",
  "origin": "https://browns-mill-fore-passholder.book.teeitup.golf",
  "referer": "https://browns-mill-fore-passholder.book.teeitup.golf/",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

// ─── Response types ───────────────────────────────────────────────────────────

export interface AuthResponse {
  sessionToken: string;
  customer: {
    id: string;
    username: string;
    name: { given: string; family: string; formatted: string };
    facilityId: string;
  };
}

export interface TeeTimeRate {
  _id: number;
  name: string;
  allowedPlayers: number[];
  holes: number;
  tags: string[]; // "MO"/"CI" = cart, "WR" = walking
  golfnow: {
    TTTeeTimeId: number;
    GolfCourseId: number;  // needed for invoice + cart-item
    GolfFacilityId: number;
  };
  greenFeeCart?: number;
  greenFeeWalking?: number;
  dueOnlineRiding?: number;
  dueOnlineWalking?: number;
}

export interface TeeTimeSlot {
  courseId: string;
  teetime: string; // UTC ISO string
  backNine: boolean;
  rates: TeeTimeRate[];
  bookedPlayers: number;
  minPlayers: number;
  maxPlayers: number;
}

export interface TeeTimesResponse {
  dayInfo: { dawn: string; sunrise: string; sunset: string; dusk: string };
  teetimes: TeeTimeSlot[];
}

export interface CartResponse {
  id: string;
  alias: string;
  items: CartItem[];
}

export interface CartItem {
  id: string;
  rateId: number;
  players: number;
}

export interface OrderResponse {
  id: string;
  confirmationNumber?: string;
  status: string;
}

// ─── API client ───────────────────────────────────────────────────────────────

export class KennaClient {
  private sessionToken: string | null = null;

  constructor(private readonly alias: string) {}

  private headers(authed = true): Record<string, string> {
    const h: Record<string, string> = { ...DEFAULT_HEADERS, "x-be-alias": this.alias };
    if (authed && this.sessionToken) h["session"] = this.sessionToken;
    return h;
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: this.headers(!!this.sessionToken),
      body: body != null ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Kenna API ${method} ${path} → ${res.status}: ${text.substring(0, 200)}`);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async authenticate(username: string, password: string): Promise<AuthResponse> {
    const data = await this.req<AuthResponse>("POST", "/profile/authenticate", {
      username,
      credentials: password,
      type: "basic",
    });
    this.sessionToken = data.sessionToken;
    return data;
  }

  // ── Tee times ─────────────────────────────────────────────────────────────

  async getTeeTimes(date: string, facilityId: number): Promise<TeeTimesResponse[]> {
    return this.req<TeeTimesResponse[]>(
      "GET",
      `/v2/tee-times?date=${date}&facilityIds=${facilityId}`
    );
  }

  // ── Cart ──────────────────────────────────────────────────────────────────

  async createCart(): Promise<CartResponse> {
    return this.req<CartResponse>("POST", "/shopping-cart");
  }

  async addCartItem(
    cartId: string,
    rateId: number,
    gncFacilityId: number,
    players: number,
    teeTimeUtc: string,
    courseId: string
  ): Promise<CartItem> {
    return this.req<CartItem>("POST", `/shopping-cart/${cartId}/cart-item`, {
      rateId,
      gncFacilityId,
      players,
      teeTime: teeTimeUtc,
      courseId,
    });
  }

  async isBookable(cartId: string, itemId: string): Promise<{ bookable: boolean }> {
    return this.req<{ bookable: boolean }>(
      "POST",
      `/shopping-cart/${cartId}/cart-item/${itemId}/is-bookable`
    );
  }

  // ── Lock ──────────────────────────────────────────────────────────────────

  async getLocks(courseId: string, localDate: string): Promise<unknown[]> {
    return this.req<unknown[]>(
      "GET",
      `/course/${courseId}/tee-time/locks?localDate=${localDate}`
    );
  }

  async lockTeeTime(
    courseId: string,
    localDate: string,
    localTime: string,
    rateId: number,
    players: number
  ): Promise<void> {
    await this.req<void>("PUT", `/course/${courseId}/tee-time/lock`, {
      localDate,
      localTime,
      rateId,
      players,
    });
  }

  // ── Order ─────────────────────────────────────────────────────────────────

  async createOrder(cartId: string): Promise<OrderResponse> {
    return this.req<OrderResponse>("POST", "/orders", { cartId });
  }

  async orderTeeTime(orderId: string, cartId: string): Promise<OrderResponse> {
    return this.req<OrderResponse>("POST", "/order-teetime", { orderId, cartId });
  }
}
