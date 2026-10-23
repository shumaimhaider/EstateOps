import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NewRequestDialog, RequestsList, ThreadView } from '@/features/support/index.js';
import { usePropertiesQuery } from '@/features/properties/index.js';
import Button from '@/shared/ui/Button.jsx';
import PageHeader from '@/shared/ui/PageHeader.jsx';

export default function SupportPage() {
  const { t } = useTranslation('support');
  const { requestId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const properties = usePropertiesQuery();
  const aboutProperty = params.get('property') ?? '';
  const [open, setOpen] = useState(Boolean(aboutProperty));
  const close = () => {
    setOpen(false);
    if (aboutProperty) setParams({}, { replace: true });
  };
  return (
    <>
      <PageHeader
        title={t('title')}
        description={requestId ? undefined : t('intro')}
        actions={!requestId && <Button onClick={() => setOpen(true)}>{t('newRequest')}</Button>}
      />
      {requestId ? (
        <>
          <Link className="mb-4 inline-block text-sm text-primary underline" to="/support">
            {t('thread.back')}
          </Link>
          <ThreadView id={requestId} />
        </>
      ) : (
        <RequestsList basePath="/support" />
      )}
      <NewRequestDialog
        open={open}
        defaultBookingId={aboutProperty}
        properties={(properties.data ?? []).map((p) => ({
          id: p.id,
          label: `${p.projectName} · ${p.unitNo}`,
        }))}
        onClose={close}
        onCreated={(thread) => {
          setOpen(false);
          navigate(`/support/${thread.id}`);
        }}
      />
    </>
  );
}
