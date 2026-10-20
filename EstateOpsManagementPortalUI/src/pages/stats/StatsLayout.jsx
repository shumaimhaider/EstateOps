import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCollectionsStatsQuery } from '@/features/collections/index.js';
import PageHeader from '@/shared/ui/PageHeader.jsx';
import TabNav from '@/shared/ui/TabNav.jsx';
import ProjectScopeSelect from '@/widgets/ProjectScopeSelect.jsx';
import { useProjectScope } from '@/widgets/useProjectScope.js';

/** The Stats section: collection stats and escalated cases as sibling tabs under one scope. */
export default function StatsLayout() {
  const { t } = useTranslation('collections');
  const { search } = useLocation();
  const [projectId, setProjectId] = useProjectScope();
  const stats = useCollectionsStatsQuery({ projectId });

  return (
    <div>
      <PageHeader
        title={t('stats.title')}
        description={t('stats.subtitle')}
        actions={<ProjectScopeSelect value={projectId} onChange={setProjectId} />}
      />
      <TabNav
        label={t('stats.tabs')}
        items={[
          { to: `/stats${search}`, label: t('stats.overview'), end: true },
          {
            to: `/stats/escalations${search}`,
            label: t('stats.escalated'),
            badge: stats.data?.escalatedCount,
          },
        ]}
      />
      <Outlet />
    </div>
  );
}
