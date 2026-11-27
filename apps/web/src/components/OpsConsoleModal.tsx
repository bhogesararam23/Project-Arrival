import { useState, type FC } from 'react';

interface OpsOverview {
  ordersCount: number;
  pendingOrdersCount: number;
  awaitingMerchantCount: number;
  outboxPendingCount: number;
  outboxDeadLetterCount: number;
  failedWebhooksCount: number;
  reconciliationRequiredCount: number;
  activeCapabilitiesCount: number;
  expiringCapabilitiesCount: number;
  sampleBounded?: boolean;
}

interface Props {
  onClose: () => void;
}

export const OpsConsoleModal: FC<Props> = ({ onClose }) => {
  const [operatorToken, setOperatorToken] = useState('');
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadOverview = async () => {
    if (!operatorToken.trim()) {
      setErrorMsg('Enter an operator Bearer token to access /v1/ops/overview');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/v1/ops/overview', {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${operatorToken.trim()}`,
        },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail || `HTTP ${res.status}: Unauthorized or unavailable`);
      }
      setOverview((await res.json()) as OpsOverview);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load operational overview');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Internal Operations Console">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="fixture-tag">Internal Control Plane (RBAC Protected)</span>
            <h2>Operations Overview</h2>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close operations console">&times;</button>
        </div>

        <div style={{ display: 'grid', gap: '8px', marginBottom: '16px' }}>
          <label htmlFor="ops-token-input" style={{ fontSize: '13px', fontWeight: 600 }}>
            Operator Bearer Token (never stored in browser)
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              id="ops-token-input"
              type="password"
              value={operatorToken}
              onChange={(e) => setOperatorToken(e.target.value)}
              placeholder="Paste operator token..."
              style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
            />
            <button className="btn-primary" onClick={loadOverview} disabled={loading}>
              {loading ? 'Loading...' : 'Authenticate & Load'}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div role="alert" style={{ padding: '10px', borderRadius: '6px', background: '#fff1f2', color: '#be123c', fontSize: '13px', marginBottom: '12px' }}>
            {errorMsg}
          </div>
        )}

        {overview ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '12px' }}>
            <div style={{ padding: '10px', borderRadius: '6px', background: 'var(--bg-secondary)' }}>
              <div style={{ color: 'var(--text-muted)' }}>Orders (Sample)</div>
              <strong>{overview.ordersCount}{overview.sampleBounded ? '+' : ''}</strong>
            </div>
            <div style={{ padding: '10px', borderRadius: '6px', background: 'var(--bg-secondary)' }}>
              <div style={{ color: 'var(--text-muted)' }}>Outbox Pending</div>
              <strong>{overview.outboxPendingCount}</strong>
            </div>
            <div style={{ padding: '10px', borderRadius: '6px', background: 'var(--bg-secondary)' }}>
              <div style={{ color: 'var(--text-muted)' }}>Dead-Letter Queue</div>
              <strong>{overview.outboxDeadLetterCount}</strong>
            </div>
            <div style={{ padding: '10px', borderRadius: '6px', background: 'var(--bg-secondary)' }}>
              <div style={{ color: 'var(--text-muted)' }}>Failed Webhooks</div>
              <strong>{overview.failedWebhooksCount}</strong>
            </div>
            <div style={{ padding: '10px', borderRadius: '6px', background: 'var(--bg-secondary)' }}>
              <div style={{ color: 'var(--text-muted)' }}>Reconciliation Req.</div>
              <strong>{overview.reconciliationRequiredCount}</strong>
            </div>
            <div style={{ padding: '10px', borderRadius: '6px', background: 'var(--bg-secondary)' }}>
              <div style={{ color: 'var(--text-muted)' }}>Active Capabilities</div>
              <strong>{overview.activeCapabilitiesCount}</strong>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Authenticate with a valid <code>ops_readonly</code> or <code>ops_admin</code> token to inspect live operational metrics. PII is masked by default.
          </p>
        )}
      </div>
    </div>
  );
};
