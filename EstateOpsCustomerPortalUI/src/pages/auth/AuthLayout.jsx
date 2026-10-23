import PropTypes from 'prop-types';
import { Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Card from '@/shared/ui/Card.jsx';

/** The centred card the sign-in and password pages share. */
export default function AuthLayout({ title, intro, children }) {
  const { t } = useTranslation();
  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-4">
      <div className="w-full max-w-md">
        <p className="mb-6 flex items-center justify-center gap-2 text-lg font-bold">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-white">
            <Building2 aria-hidden="true" className="size-5" />
          </span>
          {t('app.name')}
        </p>
        <Card>
          <h1 className="text-2xl font-bold">{title}</h1>
          {intro && <p className="mb-5 mt-1 text-sm text-content-muted">{intro}</p>}
          {children}
        </Card>
      </div>
    </main>
  );
}
AuthLayout.propTypes = {
  title: PropTypes.string.isRequired,
  intro: PropTypes.string,
  children: PropTypes.node,
};
