import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import EmptyState from '@/shared/ui/EmptyState.jsx';

/** Shown when the user's role does not include the page they opened. */
export default function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t('states.forbiddenTitle')}
      body={t('states.forbiddenBody')}
      action={<Link to="/">{t('states.goHome')}</Link>}
    />
  );
}
