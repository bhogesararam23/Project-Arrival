import { useState, type FC } from 'react';
import { Money } from '@arrival/contracts/money';
import type {
  Quote,
  QuoteRequest,
  OrderCreated,
  OrderabilityStatus,
  MoneyJson,
} from '@arrival/contracts';
import { defaultApiClient, ApiClientError } from '../api/client.js';

export interface CartLineItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: MoneyJson;
  modifierOptionIds?: string[];
  locationId: string;
  locationName: string;
  catalogueVersion: number;
  orderability: OrderabilityStatus;
}

interface Props {
  items: CartLineItem[];
  onUpdateQuantity: (menuItemId: string, delta: number) => void;
  onClearCart: () => void;
  onOrderCreated: (order: OrderCreated) => void;
  onClose: () => void;
}

export const CartCheckoutDrawer: FC<Props> = ({
  items,
  onUpdateQuantity,
  onClearCart,
  onOrderCreated,
  onClose,
}) => {
  const [countryCode, setCountryCode] = useState('GB');
  const [formattedAddress, setFormattedAddress] = useState('10 Downing Street, London SW1A 2AA');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const primaryItem = items[0];
  const isOrderable = primaryItem?.orderability === 'native_orderable';
  const isQuoteExpired = Boolean(quote && new Date(quote.expiresAt).getTime() <= Date.now());

  const handleRequestQuote = async () => {
    if (!primaryItem) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      let token = sessionToken;
      if (!token) {
        const sess = await defaultApiClient.createGuestSession();
        token = sess.sessionToken;
        setSessionToken(token);
      }

      const idemp = `web-quote-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const q = await defaultApiClient.createQuote(
        {
          locationId: primaryItem.locationId,
          catalogueVersion: primaryItem.catalogueVersion,
          destination: {
            countryCode: countryCode as QuoteRequest['destination']['countryCode'],
            address: { formattedAddress },
          },
          items: items.map((i) => ({
            menuItemId: i.menuItemId,
            quantity: i.quantity,
            ...(i.modifierOptionIds ? { modifierOptionIds: i.modifierOptionIds } : {}),
          })),
        },
        { idempotencyKey: idemp, sessionToken: token }
      );
      setQuote(q);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMsg(err.problem?.detail || err.message);
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to calculate authoritative quote');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitOrder = async () => {
    if (!quote || !sessionToken || !isOrderable) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const idemp = `web-order-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const created = await defaultApiClient.submitOrder(
        {
          quoteId: quote.quoteId,
          paymentMethodToken: 'tok_sandbox_test_method',
        },
        { idempotencyKey: idemp, sessionToken }
      );
      onClearCart();
      onOrderCreated(created);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMsg(err.problem?.detail || err.message);
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Order submission failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Cart and Checkout Preparation">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Your Order Basket</h2>
            {primaryItem && (
              <p className="venue-address" style={{ marginTop: '4px' }}>
                {primaryItem.locationName} (Menu v{primaryItem.catalogueVersion})
              </p>
            )}
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close basket">&times;</button>
        </div>

        {items.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', padding: '24px 0' }}>
            Your basket is empty. Select a restaurant to browse its menu.
          </p>
        ) : (
          <>
            <div className="menu-list" style={{ marginBottom: '16px' }}>
              {items.map((item) => (
                <div key={item.menuItemId} className="menu-item-row">
                  <div className="item-info">
                    <h4>{item.name}</h4>
                    <span className="item-price">{Money.formatJson(item.unitPrice)} each</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      className="btn-outline"
                      onClick={() => onUpdateQuantity(item.menuItemId, -1)}
                      aria-label={`Decrease ${item.name} quantity`}
                    >
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      className="btn-outline"
                      onClick={() => onUpdateQuantity(item.menuItemId, 1)}
                      aria-label={`Increase ${item.name} quantity`}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '16px', display: 'grid', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600 }} htmlFor="dest-country">
                Delivery Destination Country
              </label>
              <select
                id="dest-country"
                value={countryCode}
                onChange={(e) => {
                  setCountryCode(e.target.value);
                  setQuote(null);
                }}
              >
                <option value="GB">United Kingdom (GB)</option>
                <option value="DE">Germany (DE)</option>
                <option value="FR">France (FR)</option>
                <option value="US">United States (US)</option>
              </select>

              <label style={{ fontSize: '13px', fontWeight: 600 }} htmlFor="dest-address">
                Delivery Address (entered independently of device GPS)
              </label>
              <input
                id="dest-address"
                type="text"
                value={formattedAddress}
                onChange={(e) => {
                  setFormattedAddress(e.target.value);
                  setQuote(null);
                }}
                style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
              />
            </div>

            {errorMsg && (
              <div role="alert" style={{ padding: '10px', marginBottom: '12px', borderRadius: '6px', background: '#fff1f2', color: '#be123c', fontSize: '13px' }}>
                {errorMsg}
              </div>
            )}

            <button
              className="btn-primary"
              onClick={handleRequestQuote}
              disabled={loading}
              style={{ width: '100%', marginBottom: '12px' }}
            >
              {loading ? 'Calculating...' : 'Request Authoritative Server Quote'}
            </button>

            {quote && (
              <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--bg-secondary)', marginBottom: '12px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal</span>
                  <span>{Money.formatJson(quote.subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Tax ({quote.taxInclusive ? 'VAT included' : 'Estimated tax'})</span>
                  <span>{Money.formatJson(quote.tax)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Delivery Fee</span>
                  <span>{Money.formatJson(quote.delivery)}</span>
                </div>
                {quote.serviceFee && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Service Fee</span>
                    <span>{Money.formatJson(quote.serviceFee)}</span>
                  </div>
                )}
                <hr style={{ margin: '8px 0', borderColor: 'var(--border-color)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '15px' }}>
                  <span>Total</span>
                  <span>{Money.formatJson(quote.total)}</span>
                </div>
                <div style={{ marginTop: '6px', color: 'var(--text-muted)', fontSize: '11px' }}>
                  Quote expires at {new Date(quote.expiresAt).toLocaleTimeString()}
                </div>
              </div>
            )}

            {!isOrderable ? (
              <div style={{ padding: '10px', borderRadius: '6px', background: '#fefce8', color: '#854d0e', fontSize: '13px' }}>
                Native checkout is unavailable for this venue because production merchant, payment, or fulfilment capabilities are not verified.
              </div>
            ) : quote && isQuoteExpired ? (
              <div role="alert" style={{ padding: '10px', borderRadius: '6px', background: '#fff1f2', color: '#be123c', fontSize: '13px' }}>
                This quote has expired. Click &ldquo;Request Authoritative Server Quote&rdquo; above to refresh pricing.
              </div>
            ) : quote ? (
              <button
                className="btn-primary"
                onClick={handleSubmitOrder}
                disabled={loading}
                style={{ width: '100%' }}
              >
                {loading ? 'Submitting...' : 'Submit Order (Requires Verified Capability)'}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};
