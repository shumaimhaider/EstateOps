import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChangePasswordForm,
  useChangePasswordMutation,
  useProfileQuery,
} from '@/features/auth/index.js';
import { SavedCardsPanel } from '@/features/payments/index.js';
import Card from '@/shared/ui/Card.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import PageHeader from '@/shared/ui/PageHeader.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';

const FIELDS = [
  ['name', 'name'],
  ['email', 'email'],
  ['phone', 'phone'],
  ['city', 'city'],
  ['language', 'preferredLanguage'],
  ['idNumber', 'idNumberMasked'],
];

export default function AccountPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useProfileQuery();
  const change = useChangePasswordMutation();
  return (
    <>
      <PageHeader title={t('account.title')} />
      <div className="space-y-8">
        <section aria-labelledby="profile-title">
          <h2 id="profile-title" className="mb-3 text-lg font-semibold">
            {t('account.profile')}
          </h2>
          {profile.isPending && <Skeleton rows={3} />}
          {profile.isError && (
            <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
          )}
          {profile.data && (
            <Card>
              <dl className="grid gap-3 sm:grid-cols-2">
                {FIELDS.map(([label, key]) => (
                  <div key={label}>
                    <dt className="text-xs text-content-muted">{t(`account.fields.${label}`)}</dt>
                    <dd className="text-sm font-medium">{profile.data[key] || '—'}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </section>
        <SavedCardsPanel />
        <section aria-labelledby="password-title">
          <h2 id="password-title" className="mb-3 text-lg font-semibold">
            {t('account.password')}
          </h2>
          <ChangePasswordForm
            onSubmit={async (values) => {
              await change.mutateAsync(values);
              navigate('/login', { replace: true });
            }}
          />
        </section>
      </div>
    </>
  );
}
