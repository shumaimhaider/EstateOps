import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '@/shared/lib/useDebouncedValue.js';
import CheckboxField from '@/shared/ui/CheckboxField.jsx';
import SelectField from '@/shared/ui/SelectField.jsx';
import TextField from '@/shared/ui/TextField.jsx';
import { BOOKING_STATUS_META } from '../domain/booking.constants.js';

const KINDS = ['plot', 'flat', 'villa', 'shop'];

export default function BookingFilters({ filters, projects, onChange }) {
  const { t } = useTranslation('sales');
  const [text, setText] = useState(filters.search);
  const debounced = useDebouncedValue(text, 300);

  useEffect(() => {
    if (debounced !== filters.search) onChange({ search: debounced });
    // react only to the debounced text; filters.search changes come from the URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <form
      role="search"
      className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5"
      onSubmit={(e) => e.preventDefault()}
    >
      <TextField
        label={t('filters.search')}
        type="search"
        placeholder={t('filters.searchPlaceholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <SelectField
        label={t('filters.project')}
        placeholder={t('filters.all')}
        options={projects.map((p) => ({ value: p.id, label: p.name }))}
        value={filters.projectId}
        onChange={(e) => onChange({ projectId: e.target.value })}
      />
      <SelectField
        label={t('filters.kind')}
        placeholder={t('filters.all')}
        options={KINDS.map((value) => ({ value, label: t(`unitKind.${value}`) }))}
        value={filters.kind}
        onChange={(e) => onChange({ kind: e.target.value })}
      />
      <SelectField
        label={t('filters.status')}
        placeholder={t('filters.all')}
        options={Object.keys(BOOKING_STATUS_META).map((value) => ({
          value,
          label: t(`status.${value}`),
        }))}
        value={filters.status}
        onChange={(e) => onChange({ status: e.target.value })}
      />
      <CheckboxField
        className="pb-3"
        label={t('filters.escalatedOnly')}
        checked={filters.escalated}
        onChange={(e) => onChange({ escalated: e.target.checked })}
      />
    </form>
  );
}

BookingFilters.propTypes = {
  filters: PropTypes.object.isRequired,
  projects: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string, name: PropTypes.string }))
    .isRequired,
  onChange: PropTypes.func.isRequired,
};
