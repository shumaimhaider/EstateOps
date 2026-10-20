import { useEffect } from 'react';
import { useNavigate, useRouteError } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { reportError } from '@/shared/lib/errorReporter.js';
import Button from '@/shared/ui/Button.jsx';

/** Route-level errorElement: reports, explains, and offers a retry. */
export default function RouteError() {
  const { t } = useTranslation();
  const error = useRouteError();
  const navigate = useNavigate();
  useEffect(() => reportError(error, { source: 'route' }), [error]);
  return (
    <div role="alert" className="p-6">
      <h1 className="text-xl font-semibold">{t('states.errorTitle')}</h1>
      <p className="mt-2 text-sm text-content-muted">{t('states.errorGeneric')}</p>
      <Button className="mt-4" onClick={() => navigate(0)}>
        {t('actions.retry')}
      </Button>
    </div>
  );
}
