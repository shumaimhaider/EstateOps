import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@/features/auth/index.js';
import { SupportQueue, SupportThread } from '@/features/support/index.js';
import PageHeader from '@/shared/ui/PageHeader.jsx';

/** The support queue; opening a request shows its conversation. */
export default function SupportPage() {
  const { t } = useTranslation('support');
  const { requestId } = useParams();
  const navigate = useNavigate();
  const canManage = usePermission('customers.manage');
  if (requestId) {
    return (
      <div>
        <PageHeader backTo="/support" backLabel={t('back')} title={t('title')} />
        <SupportThread id={requestId} canManage={canManage} />
      </div>
    );
  }
  return (
    <div>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <SupportQueue onOpen={(request) => navigate(`/support/${request.id}`)} />
    </div>
  );
}
