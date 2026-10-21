import { useTranslation } from 'react-i18next';
import { RolePermissionsEditor } from '@/features/permissions/index.js';
import PageHeader from '@/shared/ui/PageHeader.jsx';

/** Admin-only: choose what each role can see and do in the portal. */
export default function PermissionsPage() {
  const { t } = useTranslation('permissions');
  return (
    <div>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <p className="mb-4 text-sm text-content-muted">{t('lockedNote')}</p>
      <RolePermissionsEditor />
    </div>
  );
}
