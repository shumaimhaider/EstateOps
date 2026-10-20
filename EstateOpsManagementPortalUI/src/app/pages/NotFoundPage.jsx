import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">{t('states.notFoundTitle')}</h1>
      <p className="mt-2 text-sm text-content-muted">{t('states.notFoundBody')}</p>
      <Link className="mt-4 inline-block text-primary underline" to="/">
        {t('states.goHome')}
      </Link>
    </div>
  );
}
