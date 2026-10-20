import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { convertArea, formatArea } from '@/shared/lib/area.js';
import { useTenant } from '@/shared/lib/tenant.jsx';

/** Renders an area. Pass `displayUnit` to convert (e.g. to the tenant's preferred unit). */
export default function Area({ value, unit, displayUnit }) {
  const { t } = useTranslation();
  const { locale } = useTenant();
  const target = displayUnit ?? unit;
  return (
    <span className="tabular-nums">
      {formatArea(convertArea(value, unit, target), locale)} {t(`areaUnits.${target}`)}
    </span>
  );
}

Area.propTypes = {
  value: PropTypes.number.isRequired,
  unit: PropTypes.string.isRequired,
  displayUnit: PropTypes.string,
};
