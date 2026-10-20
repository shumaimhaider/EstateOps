import PropTypes from 'prop-types';
import { formatMoney } from '@/shared/lib/money.js';
import { useTenant } from '@/shared/lib/tenant.jsx';

/** The only way money is rendered: integer minor units + currency, tabular numerals. */
export default function Money({ minor, currency }) {
  const tenant = useTenant();
  return (
    <span className="tabular-nums">
      {formatMoney(minor, currency ?? tenant.currency, tenant.locale)}
    </span>
  );
}

Money.propTypes = { minor: PropTypes.number.isRequired, currency: PropTypes.string };
