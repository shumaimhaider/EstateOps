import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import StatusPill from '@/shared/ui/StatusPill.jsx';
import { UNIT_STATUS_META } from '../domain/unit.constants.js';

export default function UnitStatusPill({ status }) {
  const { t } = useTranslation();
  const meta = UNIT_STATUS_META[status];
  return <StatusPill label={t(meta.labelKey)} tone={meta.tone} />;
}

UnitStatusPill.propTypes = { status: PropTypes.string.isRequired };
