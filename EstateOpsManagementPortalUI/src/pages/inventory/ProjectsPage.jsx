import { useTranslation } from 'react-i18next';
import { ProjectCard, useProjectsQuery } from '@/features/inventory/index.js';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import PageHeader from '@/shared/ui/PageHeader.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';

export default function ProjectsPage() {
  const { t } = useTranslation('inventory');
  const query = useProjectsQuery();
  return (
    <div>
      <PageHeader title={t('projects.title')} description={t('projects.subtitle')} />
      {query.isPending && <Skeleton rows={4} />}
      {query.isError && (
        <ErrorState
          title={t('projects.loadError')}
          error={query.error}
          onRetry={() => query.refetch()}
        />
      )}
      {query.isSuccess && query.data.length === 0 && (
        <EmptyState title={t('projects.emptyTitle')} />
      )}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {(query.data ?? []).map((project) => (
          <ProjectCard key={project.id} project={project} headingAs="h2" />
        ))}
      </div>
    </div>
  );
}
