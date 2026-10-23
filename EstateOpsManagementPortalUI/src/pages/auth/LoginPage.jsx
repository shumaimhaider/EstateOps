import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, ChartNoAxesCombined, HandCoins, Map as MapIcon } from 'lucide-react';
import {
  GoogleSignIn,
  LoginForm,
  TwoFactorForm,
  useGoogleLoginMutation,
  useLoginMutation,
  useSessionQuery,
  useVerifyCodeMutation,
} from '@/features/auth/index.js';
import { getErrorInfo } from '@/shared/lib/errors.js';
import Card from '@/shared/ui/Card.jsx';

const POINTS = [
  { key: 'point1', icon: MapIcon },
  { key: 'point2', icon: HandCoins },
  { key: 'point3', icon: ChartNoAxesCombined },
];

export default function LoginPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const location = useLocation();
  const destination = location.state?.from ?? '/';

  const session = useSessionQuery();
  const login = useLoginMutation();
  const verify = useVerifyCodeMutation();
  const google = useGoogleLoginMutation();

  const [challenge, setChallenge] = useState(null);
  const [email, setEmail] = useState('');
  const [socialError, setSocialError] = useState('');

  if (session.data) return <Navigate to={destination} replace />;

  const go = () => navigate(destination, { replace: true });

  const submitCredentials = async (values) => {
    const result = await login.mutateAsync(values);
    setEmail(values.email);
    setChallenge(result);
  };
  const submitCode = async (code) => {
    await verify.mutateAsync({ mfaToken: challenge.mfaToken, code });
    go();
  };
  const googleSignIn = async (idToken) => {
    setSocialError('');
    try {
      await google.mutateAsync(idToken);
      go();
    } catch (error) {
      setSocialError(t('google.failed', { message: getErrorInfo(error).message }));
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-sidebar via-sidebar to-primary p-12 text-primary-contrast lg:flex">
        <p className="flex items-center gap-2 text-lg font-bold">
          <Building2 aria-hidden="true" className="size-6" /> EstateOps
        </p>
        <div>
          <h2 className="max-w-md text-4xl font-bold leading-tight">{t('brand.headline')}</h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map(({ key, icon: Icon }) => (
              <li key={key} className="flex items-center gap-3 text-sm text-sidebar-content">
                <span className="grid size-9 place-items-center rounded-xl bg-white/10">
                  <Icon aria-hidden="true" className="size-[18px]" />
                </span>
                {t(`brand.${key}`)}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-sidebar-content">© EstateOps</p>
      </aside>

      <main className="grid place-items-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {challenge ? t('twoFactorTitle') : t('welcome')}
            </h1>
            <p className="mt-1 text-content-muted">{t('subtitle')}</p>
          </div>

          <Card className="space-y-5">
            {challenge ? (
              <TwoFactorForm onSubmit={submitCode} onBack={() => setChallenge(null)} />
            ) : (
              <>
                <GoogleSignIn onToken={googleSignIn} />
                {socialError && (
                  <p
                    role="alert"
                    className="rounded-xl bg-tone-danger-bg p-3 text-sm text-tone-danger-fg"
                  >
                    {socialError}
                  </p>
                )}
                <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-content-muted">
                  <span className="h-px flex-1 bg-border" />
                  {t('or')}
                  <span className="h-px flex-1 bg-border" />
                </div>
                <LoginForm onSubmit={submitCredentials} initialEmail={email} />
              </>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
