import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RunDayDetail, RunDaysList } from '@/features/collectionRuns/index.js';
import PageHeader from '@/shared/ui/PageHeader.jsx';

/** /payments/collections lists the days; /payments/collections/:date opens one. */
export default function CollectionRunsPage() {
  const { t } = useTranslation('collectionRuns');
  const { date } = useParams();
  return date ? (
    <div>
      <PageHeader
        title={t('dayTitle', { date })}
        backTo="/payments/collections"
        backLabel={t('back')}
      />
      <RunDayDetail date={date} />
    </div>
  ) : (
    <div>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <RunDaysList />
    </div>
  );
}
