import { useTranslation } from 'react-i18next';
import { BadgeCheck, Boxes, DoorOpen, Handshake } from 'lucide-react';
import {
  CollectionTrendChart,
  InventoryByType,
  StatsTiles,
  useCollectionsStatsQuery,
} from '@/features/collections/index.js';
import { ProjectCard, useProjectsQuery } from '@/features/inventory/index.js';
import { useCurrentUser } from '@/features/auth/index.js';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import PageHeader from '@/shared/ui/PageHeader.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import StatTile from '@/shared/ui/StatTile.jsx';
import EscalationSpotlight from '@/widgets/EscalationSpotlight.jsx';
import ProjectScopeSelect from '@/widgets/ProjectScopeSelect.jsx';
import { useProjectScope } from '@/widgets/useProjectScope.js';

const unitsLink = (projectId, status) => {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (projectId) params.set('project', projectId);
  const qs = params.toString();
  return `/inventory/units${qs ? `?${qs}` : ''}`;
};

/** Home: stats for all projects or one, with every number linking to the list behind it. */
export default function DashboardPage() {
  const { t } = useTranslation('dashboard');
  const user = useCurrentUser();
  const [projectId, setProjectId] = useProjectScope();
  const stats = useCollectionsStatsQuery({ projectId });
  const projects = useProjectsQuery();

  const shownProjects = (projects.data ?? []).filter((p) => !projectId || p.id === projectId);

  return (
    <div>
      <PageHeader
        title={t('title', { name: user?.name.split(' ')[0] })}
        description={t('subtitle')}
        actions={<ProjectScopeSelect value={projectId} onChange={setProjectId} />}
      />

      {stats.isPending && <Skeleton rows={8} />}
      {stats.isError && <ErrorState error={stats.error} onRetry={() => stats.refetch()} />}
      {stats.isSuccess && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label={t('units.total')}
              value={stats.data.units.total}
              icon={Boxes}
              to={unitsLink(projectId)}
            />
            <StatTile
              label={t('units.unsold')}
              value={stats.data.units.available}
              hint={t('units.unsoldHint')}
              icon={DoorOpen}
              tone="success"
              to={unitsLink(projectId, 'available')}
            />
            <StatTile
              label={t('units.booked')}
              value={stats.data.units.booked}
              hint={t('units.bookedHint')}
              icon={Handshake}
              tone="info"
              to={unitsLink(projectId, 'booked')}
            />
            <StatTile
              label={t('units.sold')}
              value={stats.data.units.sold}
              hint={t('units.soldHint')}
              icon={BadgeCheck}
              to={unitsLink(projectId, 'sold')}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <InventoryByType unitsByKind={stats.data.unitsByKind} projectId={projectId} />
            <EscalationSpotlight />
          </div>

          <StatsTiles stats={stats.data} projectId={projectId} />
          <CollectionTrendChart byMonth={stats.data.byMonth} currency={stats.data.currency} />
        </div>
      )}

      <section className="mt-10" aria-labelledby="dashboard-projects">
        <h2 id="dashboard-projects" className="mb-4 text-lg font-semibold">
          {t('projects')}
        </h2>
        {projects.isPending && <Skeleton rows={3} />}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {shownProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </section>
    </div>
  );
}
