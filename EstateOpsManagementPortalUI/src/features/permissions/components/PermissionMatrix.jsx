import { Fragment } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import Card from '@/shared/ui/Card.jsx';
import { permissionMatrixShape } from '../domain/permission.model.js';

/**
 * Permissions down the side, roles across the top. Each checkbox saves that role straight away.
 * Locked roles (owner, admin) always hold everything and cannot be changed.
 */
export default function PermissionMatrix({ matrix, busyRoles = [], onToggle }) {
  const { t } = useTranslation('permissions');
  const groups = [...new Set(matrix.catalog.map((p) => p.group))];

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="relative overflow-x-auto">
        <table className="w-full border-collapse text-sm" aria-label={t('matrix.label')}>
          <thead className="bg-surface-muted text-xs uppercase tracking-wide text-content-muted">
            <tr>
              <th scope="col" className="px-3 py-3 text-start">
                {t('matrix.permission')}
              </th>
              {matrix.roles.map(({ role, locked }) => (
                <th key={role} scope="col" className="px-2 py-3 text-center">
                  <span className="inline-flex items-center gap-1">
                    {locked && <Lock aria-hidden="true" className="size-3" />}
                    {t(`auth:roles.${role}`)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group}>
                <tr className="bg-surface-muted/50">
                  <th
                    scope="rowgroup"
                    colSpan={matrix.roles.length + 1}
                    className="px-3 py-2 text-start text-xs font-bold uppercase tracking-widest text-content-muted"
                  >
                    {t(`groups.${group}`)}
                  </th>
                </tr>
                {matrix.catalog
                  .filter((p) => p.group === group)
                  .map(({ key }) => (
                    <tr key={key} className="border-t border-border">
                      <th scope="row" className="px-3 py-2.5 text-start font-medium">
                        {t(`keys.${key}`)}
                      </th>
                      {matrix.roles.map((access) => (
                        <td key={access.role} className="px-2 py-2.5 text-center">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={access.permissions.includes(key)}
                            disabled={access.locked || busyRoles.includes(access.role)}
                            aria-label={t('matrix.cell', {
                              role: t(`auth:roles.${access.role}`),
                              permission: t(`keys.${key}`),
                            })}
                            onChange={(e) => onToggle(access, key, e.target.checked)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

PermissionMatrix.propTypes = {
  matrix: permissionMatrixShape.isRequired,
  busyRoles: PropTypes.arrayOf(PropTypes.string),
  onToggle: PropTypes.func.isRequired,
};
