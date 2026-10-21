import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { FINE_UNIT_KINDS } from '../domain/fineRule.constants.js';
import FineRuleCard from './FineRuleCard.jsx';

/**
 * A level's rate for every category together: one card for all categories, then one per unit
 * category (plots, flats, villas, shops) that can differ. A category without its own rate shows
 * the rate it falls back to.
 */
export default function FineRuleCategories({ scope, scopeId }) {
  const { t } = useTranslation('fines');
  return (
    <section
      aria-label={t('categories.groupLabel', { level: t(`scopes.${scope}`) })}
      className="space-y-3"
    >
      <FineRuleCard scope={scope} scopeId={scopeId} />
      <details className="rounded-2xl border border-border bg-surface p-4 shadow-token">
        <summary className="cursor-pointer text-sm font-semibold">
          {t('categories.summary')}
        </summary>
        <p className="mt-2 text-sm text-content-muted">{t('categories.hint')}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {FINE_UNIT_KINDS.map((unitKind) => (
            <FineRuleCard key={unitKind} scope={scope} scopeId={scopeId} unitKind={unitKind} />
          ))}
        </div>
      </details>
    </section>
  );
}

FineRuleCategories.propTypes = {
  scope: PropTypes.oneOf(['default', 'project', 'customer']).isRequired,
  scopeId: PropTypes.string,
};
