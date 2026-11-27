import { useEffect, useState, type FC } from 'react';
import type { OrderCreated, OrderView, OrderEventItem } from '@arrival/contracts';
import { defaultApiClient } from '../api/client.js';

interface Props {
  initialOrder: OrderCreated;
  onClose: () => void;
}

export const OrderTimelineModal: FC<Props> = ({ initialOrder, onClose }) => {
  const [order, setOrder] = useState<OrderView>(initialOrder);
  const [events, setEvents] = useState<OrderEventItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshTimeline = async () => {
    if (!initialOrder.guestAccessGrant) return;
    setLoading(true);
    try {
      const [latestOrder, latestEvents] = await Promise.all([
        defaultApiClient.getOrder(initialOrder.orderId, initialOrder.guestAccessGrant),
        defaultApiClient.getOrderEvents(initialOrder.orderId, initialOrder.guestAccessGrant),
      ]);
      setOrder(latestOrder);
      setEvents(latestEvents.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshTimeline();
  }, [initialOrder.orderId]);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Order Status Timeline">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Order Tracking</h2>
            <p className="venue-address" style={{ marginTop: '4px' }}>
              Order ID: <code>{order.orderId}</code>
            </p>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close timeline">&times;</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px', fontSize: '12px' }}>
          <div style={{ padding: '8px', borderRadius: '6px', background: 'var(--bg-secondary)' }}>
            <div style={{ color: 'var(--text-muted)' }}>Order State</div>
            <strong>{order.orderState}</strong>
          </div>
          <div style={{ padding: '8px', borderRadius: '6px', background: 'var(--bg-secondary)' }}>
            <div style={{ color: 'var(--text-muted)' }}>Payment State</div>
            <strong>{order.paymentState || 'unknown'}</strong>
          </div>
          <div style={{ padding: '8px', borderRadius: '6px', background: 'var(--bg-secondary)' }}>
            <div style={{ color: 'var(--text-muted)' }}>Fulfilment State</div>
            <strong>{order.fulfilmentState || 'unknown'}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h3 style={{ margin: 0 }}>Verified Event History</h3>
          <button className="btn-outline" onClick={refreshTimeline} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {events.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            No verified events recorded yet.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '8px' }}>
            {events.map((evt, idx) => (
              <li
                key={`${evt.eventType}-${idx}`}
                style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span>{evt.eventType}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{evt.source}</span>
                </div>
                {evt.message && <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>{evt.message}</p>}
                <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  {new Date(evt.occurredAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
