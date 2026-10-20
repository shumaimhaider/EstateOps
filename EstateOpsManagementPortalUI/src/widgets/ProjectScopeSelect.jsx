import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useProjectsQuery } from '@/features/inventory/index.js';
import SelectField from '@/shared/ui/SelectField.jsx';

/** "All projects" or one project. Drives the stats on the dashboard and the stats section. */
export default function ProjectScopeSelect({ value, onChange }) {
  const { t } = useTranslation();
  const projects = useProjectsQuery();
  return (
    <SelectField
      className="min-w-56"
      label={t('scope.label')}
      placeholder={t('scope.all')}
      options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

ProjectScopeSelect.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};
