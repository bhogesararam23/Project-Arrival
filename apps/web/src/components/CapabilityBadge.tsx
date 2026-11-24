import type { FC } from 'react';
import type { OrderabilityStatus } from '@arrival/contracts';

interface Props {
  status: OrderabilityStatus;
}

export const CapabilityBadge: FC<Props> = ({ status }) => {
  switch (status) {
    case 'native_orderable':
      return (
        <span className="badge badge-orderable" title="Verified POS and payment routes active in this market">
          ● Orderable
        </span>
      );
    case 'catalogue_only':
      return (
        <span className="badge badge-catalogue-only" title="Menu browsing supported; ordering integration not yet live">
          ○ Catalogue Only
        </span>
      );
    case 'capability_pending':
      return (
        <span className="badge badge-pending" title="Integration undergoing capability verification">
          ◌ Capability Pending
        </span>
      );
    case 'not_integrated':
    default:
      return (
        <span className="badge badge-not-integrated" title="Public listing from licensed discovery registry">
          × Unintegrated
        </span>
      );
  }
};
