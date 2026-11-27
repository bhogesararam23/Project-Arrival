import { useState, useEffect, useCallback, type FC } from 'react';
import type { SearchItem, OrderCreated } from '@arrival/contracts';
import { SearchBar } from './components/SearchBar.js';
import { RestaurantCard } from './components/RestaurantCard.js';
import { RestaurantDetail } from './components/RestaurantDetail.js';
import { CartCheckoutDrawer, type CartLineItem } from './components/CartCheckoutDrawer.js';
import { OrderTimelineModal } from './components/OrderTimelineModal.js';
import { OpsConsoleModal } from './components/OpsConsoleModal.js';
import { defaultApiClient, ApiClientError } from './api/client.js';
import './styles/app.css';

// Baseline synthetic discovery items matching backend API fixtures for fast initial render
const INITIAL_ITEMS: SearchItem[] = [
  {
    venueId: 'e1000000-0000-4000-a000-000000000001',
    locationId: 'f1000000-0000-4000-a000-000000000001',
    name: '[SYNTHETIC TEST FIXTURE] Westminster Artisan Bakery',
    countryCode: 'GB',
    address: '12 Victoria St, Westminster, London SW1H 0EX, UK',
    discoverable: true,
    lastVerifiedAt: '2026-01-01T00:00:00Z',
    orderability: 'native_orderable',
    attribution: ['Arrival Licensed Core Registry', 'Direct Merchant Submission'],
  },
  {
    venueId: 'e1000000-0000-4000-a000-000000000002',
    locationId: 'f1000000-0000-4000-a000-000000000002',
    name: '[SYNTHETIC TEST FIXTURE] Covent Garden Craft Pizzeria',
    countryCode: 'GB',
    address: '45 Floral St, Covent Garden, London WC2E 9DG, UK',
    discoverable: true,
    lastVerifiedAt: '2026-01-01T00:00:00Z',
    orderability: 'catalogue_only',
    attribution: ['Arrival Licensed Core Registry'],
  },
  {
    venueId: 'e1000000-0000-4000-a000-000000000003',
    locationId: 'f1000000-0000-4000-a000-000000000003',
    name: '[SYNTHETIC TEST FIXTURE] Berlin Mitte Specialty Coffee',
    countryCode: 'DE',
    address: 'Torstraße 101, 10119 Berlin, Germany',
    discoverable: true,
    lastVerifiedAt: '2026-01-01T00:00:00Z',
    orderability: 'capability_pending',
    attribution: ['Arrival European Partner Registry'],
  },
];

export const App: FC = () => {
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [items, setItems] = useState<SearchItem[]>(INITIAL_ITEMS);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SearchItem | null>(null);
  const [cartItems, setCartItems] = useState<CartLineItem[]>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('arrival_cart_v1');
        return saved ? (JSON.parse(saved) as CartLineItem[]) : [];
      }
    } catch {
      // Ignore storage errors
    }
    return [];
  });
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isOpsOpen, setIsOpsOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<OrderCreated | null>(null);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('arrival_cart_v1', JSON.stringify(cartItems));
      }
    } catch {
      // Ignore storage errors
    }
  }, [cartItems]);

  const executeSearch = useCallback(async (searchQuery: string, searchCountry: string) => {
    // If empty query and no country filter, display initial verified pilot fixtures
    if (!searchQuery.trim() && !searchCountry) {
      setItems(INITIAL_ITEMS);
      setErrorMessage(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const q = searchQuery.trim() || 'bakery';
      const res = await defaultApiClient.searchPlaces({
        q,
        ...(searchCountry ? { country: searchCountry } : {}),
      });
      setItems(res.items);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.problem?.detail || err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to connect to discovery service');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      executeSearch(query, country);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, country, executeSearch]);

  const handleAddToCart = (_name: string, _priceFormatted: string, cartLine?: CartLineItem) => {
    if (!cartLine) return;
    setCartItems((prev) => {
      const existing = prev.find((i) => i.menuItemId === cartLine.menuItemId);
      if (existing) {
        return prev.map((i) =>
          i.menuItemId === cartLine.menuItemId ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, cartLine];
    });
  };

  const handleUpdateQuantity = (menuItemId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((i) => (i.menuItemId === menuItemId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  };

  const totalCartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand-section">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="brand-badge">Engine v0.1</span>
              <h1 className="brand-title">Arrival</h1>
            </div>
            <p className="brand-subtitle">
              Multi-market food discovery with capability-verified order orchestration
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {activeOrder && (
            <button className="btn-outline" onClick={() => setActiveOrder(activeOrder)}>
              Track Order
            </button>
          )}
          <button
            className="btn-outline"
            onClick={() => setIsCartOpen(true)}
            aria-label={`Open basket with ${totalCartCount} items`}
          >
            Basket: <strong>{totalCartCount} items</strong>
          </button>
          <button
            className="btn-outline"
            onClick={() => setIsOpsOpen(true)}
            aria-label="Open internal operations console"
          >
            Ops Console
          </button>
        </div>
      </header>

      <main>
        {/* Synthetic provenance alert banner */}
        <div className="synthetic-banner" role="status" aria-label="Synthetic Data Notice">
          <span style={{ fontSize: '16px' }}>&#9888;</span>
          <span>
            <strong>Synthetic Test Environment:</strong> All venues, menus, and prices are sandbox fixtures.
            Live financial transactions and physical fulfillment are disabled.
          </span>
        </div>

        <SearchBar
          query={query}
          country={country}
          onQueryChange={setQuery}
          onCountryChange={setCountry}
        />

        {/* Error State Banner with Retry */}
        {errorMessage && (
          <div className="state-error" role="alert">
            <div>
              <strong>Search Error: </strong>
              <span>{errorMessage}</span>
            </div>
            <button className="retry-btn" onClick={() => executeSearch(query, country)}>
              Retry
            </button>
          </div>
        )}

        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {isLoading
              ? 'Searching verified venues...'
              : `${items.length} verified venue${items.length === 1 ? '' : 's'} available`}
          </span>
        </div>

        {/* Loading Spinner */}
        {isLoading && (
          <div className="state-loading">
            <div className="loading-spinner" />
            <p>Querying verified merchant discovery registry...</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !errorMessage && items.length === 0 && (
          <div className="state-empty">
            <h3>No restaurants found</h3>
            <p>No verified venues matched &ldquo;{query}&rdquo; in the selected destination.</p>
          </div>
        )}

        {/* Results Grid */}
        {!isLoading && items.length > 0 && (
          <div className="restaurant-grid">
            {items.map((item) => (
              <RestaurantCard
                key={item.locationId}
                item={item}
                onSelect={setSelectedItem}
              />
            ))}
          </div>
        )}
      </main>

      {selectedItem && (
        <RestaurantDetail
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onAddToCart={handleAddToCart}
        />
      )}

      {isCartOpen && (
        <CartCheckoutDrawer
          items={cartItems}
          onUpdateQuantity={handleUpdateQuantity}
          onClearCart={() => setCartItems([])}
          onOrderCreated={(order) => {
            setIsCartOpen(false);
            setActiveOrder(order);
          }}
          onClose={() => setIsCartOpen(false)}
        />
      )}

      {activeOrder && (
        <OrderTimelineModal
          initialOrder={activeOrder}
          onClose={() => setActiveOrder(null)}
        />
      )}

      {isOpsOpen && (
        <OpsConsoleModal onClose={() => setIsOpsOpen(false)} />
      )}
    </div>
  );
};
