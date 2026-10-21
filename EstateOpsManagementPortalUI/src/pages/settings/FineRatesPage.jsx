import { useTranslation } from 'react-i18next';
import { FineRuleCategories, FineRulesTable } from '@/features/fines/index.js';
import PageHeader from '@/shared/ui/PageHeader.jsx';

/** Late-fine rates: the tenant default and every project, property and customer override. */
export default function FineRatesPage() {
  const { t } = useTranslation('fines');
  return (
    <div className="space-y-8">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <FineRuleCategories scope="default" />
      <section aria-labelledby="fine-overrides" className="space-y-3">
        <h2 id="fine-overrides" className="text-lg font-semibold">
          {t('table.label')}
        </h2>
        <FineRulesTable />
      </section>
    </div>
  );
}
