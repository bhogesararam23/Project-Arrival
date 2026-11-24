import { useEffect, useState, type FC } from 'react';
import type { SearchItem, Catalogue } from '@arrival/contracts';
import { CapabilityBadge } from './CapabilityBadge.js';
import { defaultApiClient } from '../api/client.js';

interface Props {
  item: SearchItem;
  onClose: () => void;
  onAddToCart?: (itemName: string, priceFormatted: string) => void;
}

interface DisplayItem {
  id: string;
  name: string;
  description?: string;
  price?: { amountMinor: string; currency: string };
  priceFormatted?: string;
  available?: boolean;
  modifierGroups?: Array<{ name: string }>;
}

// Fallback synthetic items if offline / test double
const FALLBACK_MENUS: Record<string, DisplayItem[]> = {
  'f1000000-0000-4000-a000-000000000001': [
    { id: '1', name: 'Organic Sourdough Loaf', description: 'Naturally fermented 36-hour heritage flour loaf', priceFormatted: '£4.50' },
    { id: '2', name: 'Almond Croissant', description: 'Twice-baked butter croissant with frangipane', priceFormatted: '£3.80' },
  ],
  'f1000000-0000-4000-a000-000000000002': [
    { id: '3', name: 'Margherita Verace', description: 'San Marzano tomatoes, Fior di Latte, fresh basil', priceFormatted: '£11.50' },
  ],
  'f1000000-0000-4000-a000-000000000003': [
    { id: '4', name: 'Single Origin Filter Brew', description: 'Ethiopian Yirgacheffe, floral and citrus notes', priceFormatted: '€4.20' },
  ],
};

function formatPrice(amountMinor: string, currency: string): string {
  const num = Number(amountMinor) / 100;
  const symbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${num.toFixed(2)}`;
}

export const RestaurantDetail: FC<Props> = ({ item, onClose, onAddToCart }) => {
  const isOrderable = item.orderability === 'native_orderable';
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError(null);

    defaultApiClient
      .getCatalogue(item.locationId)
      .then((cat) => {
        if (mounted) {
          setCatalogue(cat);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setLoadError(err.message || 'Unable to load catalogue');
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [item.locationId]);

  const displayItems: DisplayItem[] = catalogue?.items || FALLBACK_MENUS[item.locationId] || [];

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={item.name}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="fixture-tag">Verified Test Fixture</span>
            <h2>{item.name.replace('[SYNTHETIC TEST FIXTURE] ', '')}</h2>
            <p className="venue-address" style={{ marginTop: '4px' }}>{item.address}</p>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close dialog">&times;</button>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
          <CapabilityBadge status={item.orderability} />
          {!isOrderable && (
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Online ordering is restricted: this venue is currently browse-only.
            </span>
          )}
        </div>

        <h3>Menu & Catalogue</h3>

        {loading && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div className="loading-spinner" />
            <p>Loading catalogue from live API...</p>
          </div>
        )}

        {loadError && !catalogue && (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '8px 0' }}>
            Showing cached menu preview.
          </div>
        )}

        <div className="menu-list">
          {displayItems.map((menuItem) => {
            const priceStr =
              typeof menuItem.price === 'object' && menuItem.price.amountMinor
                ? formatPrice(menuItem.price.amountMinor, menuItem.price.currency)
                : (menuItem as any).priceFormatted || '£0.00';

            return (
              <div key={menuItem.id} className="menu-item-row">
                <div className="item-info">
                  <h4>{menuItem.name}</h4>
                  {menuItem.description && <p>{menuItem.description}</p>}
                  {menuItem.modifierGroups && menuItem.modifierGroups.length > 0 && (
                    <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--accent-gold)' }}>
                      Modifiers: {menuItem.modifierGroups.map((g) => g.name).join(', ')}
                    </div>
                  )}
                </div>
                <div className="item-actions">
                  <span className="item-price">{priceStr}</span>
                  <button
                    className="add-cart-btn"
                    disabled={!isOrderable || menuItem.available === false}
                    title={!isOrderable ? 'Ordering is disabled for unverified or browse-only routes' : 'Add to cart'}
                    onClick={() => onAddToCart && onAddToCart(menuItem.name, priceStr)}
                  >
                    {isOrderable ? '+ Add' : 'Browse Only'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="provenance-box">
          <strong>Data Provenance & Source Registry:</strong>
          <p>Source: {item.attribution.join(', ')}</p>
          <p>Listing Status: {item.discoverable ? 'Verified Discoverable Record' : 'Pending Review'}</p>
          <p>Notice: This is a synthetic engineering fixture; no real business transaction will occur.</p>
        </div>
      </div>
    </div>
  );
};
