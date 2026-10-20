import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Card from '@/shared/ui/Card.jsx';
import { UNIT_STATUS_FILL, UNIT_STATUS_META } from '../domain/unit.constants.js';
import { projectMapShape } from '../domain/project.model.js';

const STATUSES = ['available', 'held', 'booked', 'sold', 'blocked'];
const MIN_LABEL_W = 30;
const MIN_LABEL_H = 14;

/**
 * Site plan: blocks outlined, one shape per unit coloured by live status. Shapes are keyboard
 * focusable buttons with a text label; the legend filters by status (colour is never the only signal).
 */
export default function ProjectMap({ map, onSelectUnit }) {
  const { t } = useTranslation('inventory');
  const [activeStatus, setActiveStatus] = useState('');
  const counts = Object.fromEntries(
    STATUSES.map((s) => [s, map.shapes.filter((x) => x.status === s).length]),
  );

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
        <span className="me-2 text-sm font-semibold">{t('map.legend')}</span>
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={activeStatus === status}
            onClick={() => setActiveStatus(activeStatus === status ? '' : status)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
              activeStatus === status
                ? 'border-primary bg-primary-soft'
                : 'border-border bg-surface'
            }`}
          >
            <svg aria-hidden="true" viewBox="0 0 10 10" className="size-2.5">
              <rect width="10" height="10" rx="2" className={UNIT_STATUS_FILL[status]} />
            </svg>
            {t(UNIT_STATUS_META[status].labelKey)}{' '}
            <span className="tabular-nums text-content-muted">{counts[status]}</span>
          </button>
        ))}
      </div>
      <div className="overflow-x-auto bg-surface-muted/50 p-3">
        <svg
          role="group"
          aria-label={t('map.label', { name: map.projectName })}
          viewBox={`0 0 ${map.width} ${map.height}`}
          className="mx-auto h-auto w-full min-w-[640px] max-w-5xl"
        >
          {map.blocks.map((block) => (
            <g key={block.id}>
              <rect
                x={block.x}
                y={block.y}
                width={block.w}
                height={block.h}
                rx="10"
                className="fill-surface stroke-border"
                strokeWidth="1.5"
              />
              <text
                x={block.x + 12}
                y={block.y + 17}
                className="fill-content-muted text-[13px] font-semibold"
              >
                {block.name}
              </text>
            </g>
          ))}
          {map.shapes.map((shape) => {
            const dimmed = activeStatus && shape.status !== activeStatus;
            const label = t('map.unitLabel', {
              unitNo: shape.unitNo,
              status: t(UNIT_STATUS_META[shape.status].labelKey),
            });
            return (
              <g
                key={shape.unitId}
                role="button"
                tabIndex={0}
                aria-label={label}
                opacity={dimmed ? 0.18 : 1}
                className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-primary [&:hover>rect]:stroke-primary"
                onClick={() => onSelectUnit(shape.unitId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectUnit(shape.unitId);
                  }
                }}
              >
                <title>{label}</title>
                <rect
                  x={shape.x}
                  y={shape.y}
                  width={shape.w}
                  height={shape.h}
                  rx="3"
                  strokeWidth="2"
                  className={`stroke-surface ${UNIT_STATUS_FILL[shape.status]}`}
                />
                {shape.w >= MIN_LABEL_W && shape.h >= MIN_LABEL_H && (
                  <text
                    x={shape.x + shape.w / 2}
                    y={shape.y + shape.h / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="pointer-events-none fill-white text-[9px] font-semibold"
                  >
                    {shape.unitNo}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </Card>
  );
}

ProjectMap.propTypes = { map: projectMapShape.isRequired, onSelectUnit: PropTypes.func.isRequired };
