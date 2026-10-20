import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '@/shared/lib/useDebouncedValue.js';
import SelectField from '@/shared/ui/SelectField.jsx';
import TextField from '@/shared/ui/TextField.jsx';
import { UNIT_KINDS, UNIT_STATUS_META } from '../domain/unit.constants.js';
import { projectShape } from '../domain/project.model.js';

/** Filters are controlled by the URL; the search box debounces before writing to it. */
export default function UnitFilters({ filters, projects, onChange }) {
  const { t } = useTranslation('inventory');
  const [text, setText] = useState(filters.search);
  const debounced = useDebouncedValue(text, 300);

  useEffect(() => {
    if (debounced !== filters.search) onChange({ search: debounced });
    // Only react to the debounced text; `filters.search` changes come from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const statusOptions = Object.entries(UNIT_STATUS_META).map(([value, m]) => ({
    value,
    label: t(m.labelKey),
  }));
  const kindOptions = UNIT_KINDS.map((value) => ({ value, label: t(`kind.${value}`) }));
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }));

  return (
    <form
      role="search"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
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
        options={projectOptions}
        placeholder={t('filters.all')}
        value={filters.projectId}
        onChange={(e) => onChange({ projectId: e.target.value })}
      />
      <SelectField
        label={t('filters.status')}
        options={statusOptions}
        placeholder={t('filters.all')}
        value={filters.status}
        onChange={(e) => onChange({ status: e.target.value })}
      />
      <SelectField
        label={t('filters.kind')}
        options={kindOptions}
        placeholder={t('filters.all')}
        value={filters.kind}
        onChange={(e) => onChange({ kind: e.target.value })}
      />
    </form>
  );
}

UnitFilters.propTypes = {
  filters: PropTypes.shape({
    search: PropTypes.string,
    status: PropTypes.string,
    kind: PropTypes.string,
    projectId: PropTypes.string,
  }).isRequired,
  projects: PropTypes.arrayOf(projectShape).isRequired,
  onChange: PropTypes.func.isRequired,
};
