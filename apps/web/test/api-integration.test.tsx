import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ApiClient, ApiClientError } from '../src/api/client.js';
import { App } from '../src/App.js';
import { RestaurantDetail } from '../src/components/RestaurantDetail.js';

describe('Web API Client & Component Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('ApiClient formats query parameters and handles successful responses', async () => {
    const mockResponse = {
      items: [
        {
          venueId: 'v1',
          locationId: 'l1',
          name: 'Test Bakery',
          countryCode: 'GB',
          address: 'London, UK',
          discoverable: true,
          lastVerifiedAt: '2026-01-01T00:00:00Z',
          orderability: 'native_orderable',
          attribution: ['Test Source'],
        },
      ],
      nextCursor: null,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as any);

    const client = new ApiClient({ baseUrl: 'http://localhost:3000' });
    const result = await client.searchPlaces({ q: 'bakery', country: 'GB' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe('Test Bakery');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/places/search?q=bakery&country=GB',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('ApiClient extracts RFC 9457 Problem Details on HTTP error responses', async () => {
    const problem = {
      type: 'https://arrival.internal/errors/bad-request',
      title: 'Bad Request',
      status: 400,
      detail: 'Query parameter q is required',
      code: 'INVALID_REQUEST',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => problem,
    } as any);

    const client = new ApiClient({ baseUrl: 'http://localhost:3000' });

    await expect(client.searchPlaces({ q: '' })).rejects.toThrow('Query parameter q is required');

    try {
      await client.searchPlaces({ q: '' });
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiClientError);
      expect(err.status).toBe(400);
      expect(err.problem?.code).toBe('INVALID_REQUEST');
    }
  });

  it('renders App with synthetic test environment notice banner', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Synthetic Test Environment');
    expect(html).toContain('Arrival');
  });

  it('renders RestaurantDetail with catalogue drawer structure and provenance disclaimer', () => {
    const testItem = {
      venueId: 'v1',
      locationId: 'f1000000-0000-4000-a000-000000000001',
      name: '[SYNTHETIC TEST FIXTURE] Westminster Artisan Bakery',
      countryCode: 'GB',
      address: '12 Victoria St, Westminster, London SW1H 0EX, UK',
      discoverable: true,
      lastVerifiedAt: '2026-01-01T00:00:00Z',
      orderability: 'native_orderable' as const,
      attribution: ['Arrival Licensed Core Registry'],
    };

    const html = renderToString(<RestaurantDetail item={testItem} onClose={() => {}} />);
    expect(html).toContain('Westminster Artisan Bakery');
    expect(html).toContain('Menu &amp; Catalogue');
    expect(html).toContain('Data Provenance &amp; Source Registry');
    expect(html).toContain('Verified Test Fixture');
  });
});
