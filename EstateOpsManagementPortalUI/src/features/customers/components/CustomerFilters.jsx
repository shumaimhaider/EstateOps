import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '@/shared/lib/useDebouncedValue.js';
import CheckboxField from '@/shared/ui/CheckboxField.jsx';
import TextField from '@/shared/ui/TextField.jsx';

export default function CustomerFilters({ filters, onChange }) {
  const { t } = useTranslation('customers');
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
      className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={(e) => e.preventDefault()}
    >
      <TextField
        className="lg:col-span-2"
        label={t('filters.search')}
        type="search"
        placeholder={t('filters.searchPlaceholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <CheckboxField
        className="pb-3"
        label={t('filters.overdueOnly')}
        checked={filters.hasOverdue}
        onChange={(e) => onChange({ hasOverdue: e.target.checked })}
      />
    </form>
  );
}

CustomerFilters.propTypes = {
  filters: PropTypes.shape({ search: PropTypes.string, hasOverdue: PropTypes.bool }).isRequired,
  onChange: PropTypes.func.isRequired,
};
