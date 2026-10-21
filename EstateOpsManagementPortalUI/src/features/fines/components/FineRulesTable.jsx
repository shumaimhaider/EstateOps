import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import Button from '@/shared/ui/Button.jsx';
import Card from '@/shared/ui/Card.jsx';
import ConfirmDialog from '@/shared/ui/ConfirmDialog.jsx';
import DateTime from '@/shared/ui/DateTime.jsx';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { useToast } from '@/shared/ui/toast/toastContext.js';
import { useDeleteFineRuleMutation } from '../hooks/useDeleteFineRuleMutation.js';
import { useFineRulesQuery } from '../hooks/useFineRulesQuery.js';
import FineRate from './FineRate.jsx';

const ruleLabel = (rule, t) =>
  [rule.scopeName ?? t('scopes.default'), rule.unitKind && t(`categories.${rule.unitKind}`)]
    .filter(Boolean)
    .join(' · ');

/** Every configured fine rate in one place, with removal of overrides where the role allows. */
export default function FineRulesTable() {
  const { t } = useTranslation('fines');
  const toast = useToast();
  const query = useFineRulesQuery();
  const remove = useDeleteFineRuleMutation();
  const [target, setTarget] = useState(null);

  if (query.isPending) return <Skeleton rows={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const overrides = query.data.filter((r) => r.scope !== 'default' || r.unitKind !== null);
  if (overrides.length === 0) {
    return <EmptyState title={t('table.emptyTitle')} body={t('table.emptyBody')} />;
  }

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" aria-label={t('table.label')}>
          <thead className="bg-surface-muted text-start text-xs uppercase tracking-wide text-content-muted">
            <tr>
              <th scope="col" className="px-3 py-3 text-start">
                {t('table.level')}
              </th>
              <th scope="col" className="px-3 py-3 text-start">
                {t('table.appliesTo')}
              </th>
              <th scope="col" className="px-3 py-3 text-start">
                {t('table.category')}
              </th>
              <th scope="col" className="px-3 py-3 text-start">
                {t('table.rate')}
              </th>
              <th scope="col" className="px-3 py-3 text-start">
                {t('table.updated')}
              </th>
              <th scope="col" className="px-3 py-3">
                <span className="sr-only">{t('table.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {overrides.map((rule) => (
              <tr key={rule.id} className="border-t border-border">
                <td className="px-3 py-3">{t(`scopes.${rule.scope}`)}</td>
                <td className="px-3 py-3 font-medium">{rule.scopeName ?? t('table.everywhere')}</td>
                <td className="px-3 py-3">
                  {rule.unitKind ? t(`categories.${rule.unitKind}`) : t('categories.all')}
                </td>
                <td className="px-3 py-3">
                  <FineRate rule={rule} />
                </td>
                <td className="px-3 py-3 text-content-muted">
                  {rule.updatedAt ? <DateTime iso={rule.updatedAt} /> : '—'}
                  {rule.updatedByName && (
                    <span className="block text-xs">{rule.updatedByName}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-end">
                  {rule.allowedActions.includes('delete') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('table.remove', { name: ruleLabel(rule, t) })}
                      onClick={() => setTarget(rule)}
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={Boolean(target)}
        title={t('card.clearTitle')}
        message={t('table.removeMessage', { name: target ? ruleLabel(target, t) : '' })}
        confirmLabel={t('card.clear')}
        pending={remove.isPending}
        onCancel={() => setTarget(null)}
        onConfirm={async () => {
          await remove.mutateAsync(target.id);
          toast.show({ tone: 'success', message: t('card.cleared') });
          setTarget(null);
        }}
      />
    </Card>
  );
}
