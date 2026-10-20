import {
  AgeingChart,
  CollectionTrendChart,
  InstallmentCounts,
  ProjectBreakdownTable,
  StatsTiles,
  useCollectionsStatsQuery,
} from '@/features/collections/index.js';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { useProjectScope } from '@/widgets/useProjectScope.js';

export default function StatsOverviewPage() {
  const [projectId] = useProjectScope();
  const stats = useCollectionsStatsQuery({ projectId });

  if (stats.isPending) return <Skeleton rows={8} />;
  if (stats.isError) return <ErrorState error={stats.error} onRetry={() => stats.refetch()} />;

  const s = stats.data;
  return (
    <div className="space-y-6">
      <StatsTiles stats={s} projectId={projectId} />
      <InstallmentCounts installments={s.installments} projectId={projectId} />
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <CollectionTrendChart byMonth={s.byMonth} currency={s.currency} />
        <AgeingChart ageing={s.ageing} currency={s.currency} />
      </div>
      <ProjectBreakdownTable projects={s.byProject} />
    </div>
  );
}
