import PropTypes from 'prop-types';

/**
 * A late-fine rate: a percentage of the installment amount, or a fixed amount per overdue
 * installment. The most specific one wins: customer, then property (unit), project, default.
 * @typedef {'default'|'project'|'unit'|'customer'} FineScope
 * @typedef {{ minor: number, currency: string }} Money
 * @typedef {{
 *   id: string, scope: FineScope, scopeId: string|null, scopeName: string|null,
 *   unitKind: 'plot'|'flat'|'villa'|'shop'|null,
 *   kind: 'percent'|'fixed', percent: number|null, amount: Money|null, currency: string,
 *   allowedActions: string[], updatedAt: string|null, updatedByName: string|null
 * }} FineRule
 * @typedef {{
 *   rule: FineRule, inherited: boolean, scope: FineScope, scopeId: string|null,
 *   unitKind: 'plot'|'flat'|'villa'|'shop'|null,
 *   allowedActions: string[]
 * }} EffectiveFineRule
 */
export const fineRuleShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  scope: PropTypes.string.isRequired,
  scopeName: PropTypes.string,
  unitKind: PropTypes.string,
  kind: PropTypes.oneOf(['percent', 'fixed']).isRequired,
  percent: PropTypes.number,
  amount: PropTypes.shape({ minor: PropTypes.number, currency: PropTypes.string }),
  allowedActions: PropTypes.arrayOf(PropTypes.string).isRequired,
});

export const effectiveFineRuleShape = PropTypes.shape({
  rule: fineRuleShape.isRequired,
  inherited: PropTypes.bool.isRequired,
  scope: PropTypes.string.isRequired,
  scopeId: PropTypes.string,
  unitKind: PropTypes.string,
  allowedActions: PropTypes.arrayOf(PropTypes.string).isRequired,
});
