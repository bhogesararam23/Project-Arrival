import { useState, useMemo, type FC } from 'react';
import type { SearchItem } from '@arrival/contracts';
import { SearchBar } from './components/SearchBar.js';
import { RestaurantCard } from './components/RestaurantCard.js';
import { RestaurantDetail } from './components/RestaurantDetail.js';
import './styles/app.css';

// Synthetic discovery items matching backend API fixtures
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
  const [selectedItem, setSelectedItem] = useState<SearchItem | null>(null);
  const [cartItems, setCartItems] = useState<Array<{ name: string; priceFormatted: string }>>([]);

  const filteredItems = useMemo(() => {
    return INITIAL_ITEMS.filter((item) => {
      if (country && item.countryCode !== country) {
        return false;
      }
      if (query.trim()) {
        const q = query.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.address.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [query, country]);

  const handleAddToCart = (name: string, priceFormatted: string) => {
    setCartItems((prev) => [...prev, { name, priceFormatted }]);
  };

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Cart: <strong>{cartItems.length} items</strong>
          </span>
        </div>
      </header>

      <main>
        <SearchBar
          query={query}
          country={country}
          onQueryChange={setQuery}
          onCountryChange={setCountry}
        />

        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
            Showing {filteredItems.length} verified discovery destination(s)
          </span>
          <span style={{ fontSize: '12px', color: '#f59e0b' }}>
            ⚠ Pilot Environment — Cross-border ordering strictly fail-closed
          </span>
        </div>

        <div className="restaurants-grid">
          {filteredItems.map((item) => (
            <RestaurantCard key={item.locationId} item={item} onSelect={setSelectedItem} />
          ))}
        </div>

        {selectedItem && (
          <RestaurantDetail
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onAddToCart={handleAddToCart}
          />
        )}
      </main>
    </div>
  );
};
