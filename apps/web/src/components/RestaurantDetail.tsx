import type { FC } from 'react';
import type { SearchItem } from '@arrival/contracts';
import { CapabilityBadge } from './CapabilityBadge.js';

interface Props {
  item: SearchItem;
  onClose: () => void;
  onAddToCart?: (itemName: string, priceFormatted: string) => void;
}

// Deterministic synthetic menu items for the fixture locations
const SAMPLE_MENUS: Record<string, Array<{ id: string; name: string; description: string; priceFormatted: string }>> = {
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

export const RestaurantDetail: FC<Props> = ({ item, onClose, onAddToCart }) => {
  const isOrderable = item.orderability === 'native_orderable';
  const menuItems = SAMPLE_MENUS[item.locationId] || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="fixture-tag">Verified Test Fixture</span>
            <h2>{item.name.replace('[SYNTHETIC TEST FIXTURE] ', '')}</h2>
            <p className="venue-address" style={{ marginTop: '4px' }}>{item.address}</p>
          </div>
          <button className="close-btn" onClick={onClose}>&times;</button>
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
        <div className="menu-list">
          {menuItems.map((menuItem) => (
            <div key={menuItem.id} className="menu-item-row">
              <div className="item-info">
                <h4>{menuItem.name}</h4>
                <p>{menuItem.description}</p>
              </div>
              <div className="item-actions">
                <span className="item-price">{menuItem.priceFormatted}</span>
                <button
                  className="add-cart-btn"
                  disabled={!isOrderable}
                  title={!isOrderable ? 'Ordering is disabled for unverified or browse-only routes' : 'Add to cart'}
                  onClick={() => onAddToCart && onAddToCart(menuItem.name, menuItem.priceFormatted)}
                >
                  {isOrderable ? '+ Add' : 'Browse Only'}
                </button>
              </div>
            </div>
          ))}
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
