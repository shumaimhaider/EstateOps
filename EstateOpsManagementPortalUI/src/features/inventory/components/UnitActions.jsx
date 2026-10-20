import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Button from '@/shared/ui/Button.jsx';
import ConfirmDialog from '@/shared/ui/ConfirmDialog.jsx';
import { UNIT_ACTIONS } from '../domain/unit.constants.js';
import { presentableActions } from '../domain/unit.rules.js';
import { unitShape } from '../domain/unit.model.js';

/** Buttons only for actions the server lists in `allowedActions`; each one confirms first. */
export default function UnitActions({ unit, onAction, pending = false }) {
  const { t } = useTranslation('inventory');
  const [confirming, setConfirming] = useState(null);
  const actions = presentableActions(unit);
  if (actions.length === 0) return null;

  const meta = confirming ? UNIT_ACTIONS[confirming] : null;
  return (
    <>
      {actions.map((action) => (
        <Button key={action} variant="secondary" onClick={() => setConfirming(action)}>
          {t(UNIT_ACTIONS[action].labelKey)}
        </Button>
      ))}
      {confirming && (
        <ConfirmDialog
          open
          title={t(meta.labelKey)}
          message={t(meta.confirmKey, { unitNo: unit.unitNo })}
          pending={pending}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            await onAction(unit, confirming);
            setConfirming(null);
          }}
        />
      )}
    </>
  );
}

UnitActions.propTypes = {
  unit: unitShape.isRequired,
  onAction: PropTypes.func.isRequired,
  pending: PropTypes.bool,
};
