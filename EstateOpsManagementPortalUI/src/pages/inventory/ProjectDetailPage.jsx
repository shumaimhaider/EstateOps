import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Rows3 } from 'lucide-react';
import { Can } from '@/features/auth/index.js';
import { FineRuleCategories } from '@/features/fines/index.js';
import { ProjectMap, useProjectMapQuery, useProjectQuery } from '@/features/inventory/index.js';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import PageHeader from '@/shared/ui/PageHeader.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { getErrorInfo } from '@/shared/lib/errors.js';
import EmptyState from '@/shared/ui/EmptyState.jsx';

/** One project: its live site plan. Select a unit on the map to open it. */
export default function ProjectDetailPage() {
  const { t } = useTranslation('inventory');
  const { projectId } = useParams();
  const navigate = useNavigate();
  const project = useProjectQuery(projectId);
  const map = useProjectMapQuery(projectId);

  if (project.isError && getErrorInfo(project.error).status === 404) {
    return <EmptyState title={t('projects.notFound')} />;
  }

  return (
    <div>
      <PageHeader
        backTo="/inventory/projects"
        backLabel={t('map.back')}
        title={project.data?.name ?? t('map.title')}
        description={project.data ? `${project.data.location} · ${t('map.hint')}` : undefined}
        actions={
          <Link
            to={`/inventory/units?project=${projectId}`}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold shadow-sm hover:bg-surface-muted"
          >
            <Rows3 aria-hidden="true" className="size-4" />
            {t('map.unitsTab')}
          </Link>
        }
      />
      <Can perm="fines.view">
        <div className="mb-6">
          <FineRuleCategories scope="project" scopeId={projectId} />
        </div>
      </Can>
      {map.isPending && <Skeleton rows={8} />}
      {map.isError && <ErrorState error={map.error} onRetry={() => map.refetch()} />}
      {map.isSuccess && (
        <ProjectMap
          map={map.data}
          onSelectUnit={(unitId) => navigate(`/inventory/units/${unitId}`)}
        />
      )}
    </div>
  );
}
