import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from '../src/App.js';
import { CapabilityBadge } from '../src/components/CapabilityBadge.js';

describe('Web customer application components', () => {
  it('renders CapabilityBadge with correct status classes and labels', () => {
    const htmlOrderable = renderToString(<CapabilityBadge status="native_orderable" />);
    expect(htmlOrderable).toContain('badge-orderable');
    expect(htmlOrderable).toContain('Orderable');

    const htmlCatalogue = renderToString(<CapabilityBadge status="catalogue_only" />);
    expect(htmlCatalogue).toContain('badge-catalogue-only');
    expect(htmlCatalogue).toContain('Catalogue Only');

    const htmlPending = renderToString(<CapabilityBadge status="capability_pending" />);
    expect(htmlPending).toContain('badge-pending');
    expect(htmlPending).toContain('Capability Pending');
  });

  it('renders main App container with brand title and synthetic fixtures', () => {
    const appHtml = renderToString(<App />);
    expect(appHtml).toContain('Arrival');
    expect(appHtml).toContain('Westminster Artisan Bakery');
    expect(appHtml).toContain('Synthetic Test Fixture');
  });
});
