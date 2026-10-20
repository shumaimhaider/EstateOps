import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Map as MapIcon, MapPin, Rows3 } from 'lucide-react';
import Card from '@/shared/ui/Card.jsx';
import ProgressBar from '@/shared/ui/ProgressBar.jsx';
import StatusPill from '@/shared/ui/StatusPill.jsx';
import { PROJECT_KIND_LABEL_KEYS } from '../domain/unit.constants.js';
import { projectShape } from '../domain/project.model.js';

const STATUSES = ['available', 'held', 'booked', 'sold', 'blocked'];

/** Project summary: unit counts per status (each links to that filtered unit list) and map/units links. */
export default function ProjectCard({ project, headingAs: Heading = 'h3' }) {
  const { t } = useTranslation('inventory');
  const { unitCounts: counts, unitsTotal } = project;
  const soldShare = unitsTotal === 0 ? 0 : ((counts.sold + counts.booked) / unitsTotal) * 100;
  return (
    <Card as="article" aria-label={project.name} className="flex flex-col gap-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <Heading className="text-lg font-semibold">
            <Link to={`/inventory/projects/${project.id}`} className="hover:underline">
              {project.name}
            </Link>
          </Heading>
          <StatusPill label={t(PROJECT_KIND_LABEL_KEYS[project.kind])} tone="info" />
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-content-muted">
          <MapPin aria-hidden="true" className="size-4" />
          {project.location} · {t('projects.unitsTotal', { count: unitsTotal })}
        </p>
      </div>
      <div>
        <div className="mb-1.5 flex justify-between text-xs text-content-muted">
          <span>{t('projects.sellThrough')}</span>
          <span className="tabular-nums">{Math.round(soldShare)}%</span>
        </div>
        <ProgressBar
          value={soldShare}
          label={t('projects.sellThroughLabel', { name: project.name })}
        />
      </div>
      <ul className="grid grid-cols-5 gap-2 text-center">
        {STATUSES.map((status) => (
          <li key={status}>
            <Link
              to={`/inventory/units?project=${project.id}&status=${status}`}
              className="block rounded-xl bg-surface-muted p-2 hover:bg-primary-soft"
            >
              <span className="block text-lg font-bold tabular-nums">{counts[status]}</span>
              <span className="block text-[11px] leading-tight text-content-muted">
                {t(`projects.counts.${status}`)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex gap-2">
        <Link
          to={`/inventory/projects/${project.id}`}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast hover:brightness-110"
        >
          <MapIcon aria-hidden="true" className="size-4" />
          {t('projects.openMap')}
        </Link>
        <Link
          to={`/inventory/units?project=${project.id}`}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-muted"
        >
          <Rows3 aria-hidden="true" className="size-4" />
          {t('projects.viewUnits')}
        </Link>
      </div>
    </Card>
  );
}

ProjectCard.propTypes = {
  project: projectShape.isRequired,
  headingAs: PropTypes.oneOf(['h2', 'h3']),
};
