import type {
  SearchQuery,
  SearchResponse,
  MerchantLocation,
  Catalogue,
  ProblemDetails,
  QuoteRequest,
  Quote,
  CreateOrderRequest,
  OrderCreated,
  OrderView,
  OrderEventsResponse,
} from '@arrival/contracts';

export class ApiClientError extends Error {
  readonly problem?: ProblemDetails | undefined;
  readonly status: number;

  constructor(status: number, message: string, problem?: ProblemDetails) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.problem = problem;
  }
}

export interface ApiClientOptions {
  baseUrl?: string;
}

export class ApiClient {
  private readonly baseUrl: string;

  constructor(options?: ApiClientOptions) {
    this.baseUrl = (options?.baseUrl || '').replace(/\/$/, '');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(init?.headers);
    headers.set('Accept', 'application/json, application/problem+json');

    const res = await fetch(url, {
      ...init,
      headers,
    });

    if (!res.ok) {
      let problem: ProblemDetails | undefined;
      let errorMsg = `HTTP ${res.status}: ${res.statusText}`;

      try {
        const json = await res.json();
        if (json && typeof json === 'object' && 'detail' in json) {
          problem = json as ProblemDetails;
          errorMsg = problem.detail || errorMsg;
        }
      } catch {
        // preserve status text
      }

      throw new ApiClientError(res.status, errorMsg, problem);
    }

    return res.json() as Promise<T>;
  }

  async searchPlaces(query: SearchQuery): Promise<SearchResponse> {
    const params = new URLSearchParams();
    params.set('q', query.q);
    if (query.country) params.set('country', query.country);
    if (query.lat !== undefined) params.set('lat', query.lat.toString());
    if (query.lon !== undefined) params.set('lon', query.lon.toString());
    if (query.cursor) params.set('cursor', query.cursor);

    return this.request<SearchResponse>(`/v1/places/search?${params.toString()}`);
  }

  async getLocation(locationId: string): Promise<MerchantLocation> {
    return this.request<MerchantLocation>(`/v1/places/locations/${encodeURIComponent(locationId)}`);
  }

  async getCatalogue(locationId: string): Promise<Catalogue> {
    return this.request<Catalogue>(`/v1/catalogues/${encodeURIComponent(locationId)}`);
  }

  async createGuestSession(): Promise<{ sessionId: string; sessionToken: string; expiresAt: string }> {
    return this.request('/v1/guest-sessions', { method: 'POST' });
  }

  async createQuote(
    body: QuoteRequest,
    options: { idempotencyKey: string; sessionToken?: string }
  ): Promise<Quote> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Idempotency-Key': options.idempotencyKey,
    };
    if (options.sessionToken) {
      headers['Authorization'] = `Bearer ${options.sessionToken}`;
    }
    return this.request<Quote>('/v1/checkout-quotes', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  async submitOrder(
    body: CreateOrderRequest,
    options: { idempotencyKey: string; sessionToken: string }
  ): Promise<OrderCreated> {
    return this.request<OrderCreated>('/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': options.idempotencyKey,
        Authorization: `Bearer ${options.sessionToken}`,
      },
      body: JSON.stringify(body),
    });
  }

  async getOrder(orderId: string, accessToken: string): Promise<OrderView> {
    return this.request<OrderView>(`/v1/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  async getOrderEvents(orderId: string, accessToken: string): Promise<OrderEventsResponse> {
    return this.request<OrderEventsResponse>(`/v1/orders/${encodeURIComponent(orderId)}/events`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
}

export const defaultApiClient = new ApiClient();
