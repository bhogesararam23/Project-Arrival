import type {
  SearchQuery,
  SearchResponse,
  MerchantLocation,
  Catalogue,
  ProblemDetails,
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
}

export const defaultApiClient = new ApiClient();
