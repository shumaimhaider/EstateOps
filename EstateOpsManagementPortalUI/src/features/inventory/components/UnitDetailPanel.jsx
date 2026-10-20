import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Area from '@/shared/ui/Area.jsx';
import Card from '@/shared/ui/Card.jsx';
import DateTime from '@/shared/ui/DateTime.jsx';
import ImageGallery from '@/shared/ui/ImageGallery.jsx';
import Money from '@/shared/ui/Money.jsx';
import { KINDS_WITH_PICTURES } from '../domain/unit.constants.js';
import { unitLocationLabel } from '../domain/unit.rules.js';
import { unitShape } from '../domain/unit.model.js';
import UnitStatusPill from './UnitStatusPill.jsx';

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-content-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
Field.propTypes = { label: PropTypes.string.isRequired, children: PropTypes.node };

/** Read-only overview plus status history (the unit's activity trail). */
export default function UnitDetailPanel({ unit }) {
  const { t } = useTranslation('inventory');
  const none = '—';
  const showGallery = KINDS_WITH_PICTURES.includes(unit.kind) && unit.media.length > 0;
  return (
    <div className="space-y-6">
      {showGallery && (
        <Card as="section" aria-labelledby="unit-pictures">
          <h2 id="unit-pictures" className="mb-3 text-base font-semibold">
            {t('detail.pictures')}
          </h2>
          <ImageGallery images={unit.media} label={t('detail.pictures')} />
        </Card>
      )}
      <Card as="section" aria-labelledby="unit-overview">
        <h2 id="unit-overview" className="mb-3 text-base font-semibold">
          {t('detail.overview')}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('detail.fields.project')}>{unit.projectName}</Field>
          <Field label={t('detail.fields.location')}>{unitLocationLabel(unit) || none}</Field>
          <Field label={t('detail.fields.kind')}>{t(`kind.${unit.kind}`)}</Field>
          <Field label={t('detail.fields.area')}>
            <Area value={unit.area.value} unit={unit.area.unit} />
          </Field>
          <Field label={t('detail.fields.bedrooms')}>{unit.bedrooms ?? none}</Field>
          <Field label={t('detail.fields.facing')}>{unit.facing ?? none}</Field>
          <Field label={t('detail.fields.view')}>{unit.view ?? none}</Field>
          <Field label={t('detail.fields.corner')}>
            {unit.isCorner ? t('detail.yes') : t('detail.no')}
          </Field>
          <Field label={t('detail.fields.parking')}>{unit.parkingSpaces}</Field>
          <Field label={t('detail.fields.price')}>
            <Money minor={unit.listPrice.minor} currency={unit.listPrice.currency} />
          </Field>
          <Field label={t('columns.status')}>
            <UnitStatusPill status={unit.status} />
          </Field>
          <Field label={t('detail.fields.updated')}>
            <DateTime iso={unit.updatedAt} />
          </Field>
          {unit.bookingId && (
            <Field label={t('detail.fields.sale')}>
              <Link className="text-primary hover:underline" to={`/sales/${unit.bookingId}`}>
                {t('detail.viewSale')}
              </Link>
            </Field>
          )}
        </dl>
      </Card>
      <Card as="section" aria-labelledby="unit-history">
        <h2 id="unit-history" className="mb-3 text-base font-semibold">
          {t('detail.history')}
        </h2>
        <ol className="space-y-2">
          {[...unit.statusHistory].reverse().map((h) => (
            <li
              key={`${h.status}-${h.changedAt}`}
              className="flex flex-wrap items-center gap-3 text-sm"
            >
              <UnitStatusPill status={h.status} />
              <span>{h.changedByName ?? t('detail.system')}</span>
              <DateTime iso={h.changedAt} />
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

UnitDetailPanel.propTypes = { unit: unitShape.isRequired };
