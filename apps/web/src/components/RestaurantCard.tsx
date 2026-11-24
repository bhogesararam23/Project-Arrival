import type { FC } from 'react';
import type { SearchItem } from '@arrival/contracts';
import { CapabilityBadge } from './CapabilityBadge.js';

interface Props {
  item: SearchItem;
  onSelect: (item: SearchItem) => void;
}

export const RestaurantCard: FC<Props> = ({ item, onSelect }) => {
  return (
    <div className="restaurant-card" onClick={() => onSelect(item)}>
      <div>
        <span className="fixture-tag">Synthetic Test Fixture</span>
        <div className="card-header">
          <h3 className="venue-name">{item.name.replace('[SYNTHETIC TEST FIXTURE] ', '')}</h3>
          <CapabilityBadge status={item.orderability} />
        </div>
        <p className="venue-address">{item.address}</p>
      </div>
      <div className="card-footer">
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Market: <strong>{item.countryCode}</strong>
        </span>
        <button className="explore-btn" onClick={(e) => { e.stopPropagation(); onSelect(item); }}>
          View Menu
        </button>
      </div>
    </div>
  );
};
