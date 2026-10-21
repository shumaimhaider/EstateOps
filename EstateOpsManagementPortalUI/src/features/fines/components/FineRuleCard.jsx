import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Button from '@/shared/ui/Button.jsx';
import Card from '@/shared/ui/Card.jsx';
import ConfirmDialog from '@/shared/ui/ConfirmDialog.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { useToast } from '@/shared/ui/toast/toastContext.js';
import { useDeleteFineRuleMutation } from '../hooks/useDeleteFineRuleMutation.js';
import { useEffectiveFineRuleQuery } from '../hooks/useEffectiveFineRuleQuery.js';
import { useSaveFineRuleMutation } from '../hooks/useSaveFineRuleMutation.js';
import FineRate from './FineRate.jsx';
import FineRuleDialog from './FineRuleDialog.jsx';

/**
 * The late-fine rate at one level (the default, a project, a property or a customer): what
 * applies now, whether it is inherited, and the actions the server allows for this role.
 */
export default function FineRuleCard({ scope, scopeId = null, unitKind }) {
  const { t } = useTranslation('fines');
  const toast = useToast();
  const query = useEffectiveFineRuleQuery({ scope, scopeId, unitKind });
  const save = useSaveFineRuleMutation();
  const remove = useDeleteFineRuleMutation();
  const [editing, setEditing] = useState(false);
  const [clearing, setClearing] = useState(false);

  if (query.isPending) return <Skeleton rows={2} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const { rule, inherited, allowedActions } = query.data;
  const source = t(`scopes.${rule.scope}`);
  const headingId = `fine-${scope}-${scopeId ?? 'default'}-${unitKind ?? 'all'}`;
  const sourceName = [rule.scopeName, rule.unitKind && t(`categories.${rule.unitKind}`)]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card as="section" aria-labelledby={headingId} className="space-y-3">
      <div>
        <h2 id={headingId} className="text-base font-semibold">
          {unitKind
            ? t('card.titleCategory', { category: t(`categories.${unitKind}`) })
            : t(`card.title.${scope}`)}
        </h2>
        {!unitKind && <p className="text-sm text-content-muted">{t(`card.hint.${scope}`)}</p>}
      </div>
      <p className="text-lg font-semibold">
        <FineRate rule={rule} />
      </p>
      <p className="text-sm text-content-muted">
        {inherited
          ? t('card.inherited', { source, name: sourceName }).trim()
          : t(scope === 'default' && !unitKind ? 'card.isDefault' : 'card.custom')}
      </p>
      <div className="flex flex-wrap gap-2">
        {allowedActions.includes('set') && (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            {t(!inherited || (scope === 'default' && !unitKind) ? 'card.change' : 'card.set')}
          </Button>
        )}
        {allowedActions.includes('clear') && (
          <Button size="sm" variant="ghost" onClick={() => setClearing(true)}>
            {t('card.clear')}
          </Button>
        )}
      </div>
      <FineRuleDialog
        open={editing}
        scope={scope}
        scopeId={scopeId}
        unitKind={unitKind}
        current={inherited ? undefined : rule}
        currency={rule.currency}
        onClose={() => setEditing(false)}
        onSubmit={async (next) => {
          await save.mutateAsync(next);
          toast.show({ tone: 'success', message: t('card.saved') });
          setEditing(false);
        }}
      />
      <ConfirmDialog
        open={clearing}
        title={t('card.clearTitle')}
        message={t('card.clearMessage')}
        confirmLabel={t('card.clear')}
        pending={remove.isPending}
        onCancel={() => setClearing(false)}
        onConfirm={async () => {
          await remove.mutateAsync(rule.id);
          toast.show({ tone: 'success', message: t('card.cleared') });
          setClearing(false);
        }}
      />
    </Card>
  );
}

FineRuleCard.propTypes = {
  scope: PropTypes.oneOf(['default', 'project', 'unit', 'customer']).isRequired,
  scopeId: PropTypes.string,
  unitKind: PropTypes.string,
};
