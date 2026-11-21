import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { Button } from '@/components/ui/button';
import { setLocale } from '@/i18n';
import { api, errorKey } from '@/lib/api';
import { DemoBanner } from '@/lib/DemoBanner';
import { ME_QUERY_KEY, useMe } from '@/lib/me';
import { LanguageSwitch } from '@/modules/accounts/LanguageSwitch';
import { SignInPage } from '@/modules/accounts/SignInPage';

const queryClient = new QueryClient();

/** The app shell: providers, the Demo banner on every page, and the routes. */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DemoBanner />
        <UserLocale />
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route element={<SignedInLayout />}>
            <Route index element={<HomePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

/** Signed in, the interface follows the account's saved language. */
function UserLocale() {
  const locale = useMe().me?.locale;
  useEffect(() => {
    if (locale) setLocale(locale);
  }, [locale]);
  return null;
}

function SignedInLayout() {
  const { t } = useTranslation();
  const { me, isLoading } = useMe();
  const client = useQueryClient();
  const signOut = useMutation({
    mutationFn: () => api('auth.logout', {}),
    onSuccess: () => {
      client.clear(); // drop everything cached for this user
      client.setQueryData(ME_QUERY_KEY, null);
    },
  });

  if (isLoading) return <p className="p-6">{t('common.loading')}</p>;
  if (!me) return <Navigate to="/sign-in" replace />;

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <span className="font-semibold">{t('common.appName')}</span>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">{me.name}</span>
          <LanguageSwitch />
          <Button
            variant="outline"
            size="sm"
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
          >
            {t('common.signOut')}
          </Button>
        </div>
      </header>
      {signOut.isError && (
        <p role="alert" className="px-6 pt-3 text-sm text-destructive">
          {t(errorKey(signOut.error))}
        </p>
      )}
      <main className="p-6">
        <Outlet />
      </main>
    </>
  );
}

// Placeholder until butarca's exam list takes the home page.
function HomePage() {
  const { t } = useTranslation();
  const { me } = useMe();
  if (!me) return null;
  return (
    <p>{t('accounts.home.signedInAs', { name: me.name, role: t(`accounts.roles.${me.role}`) })}</p>
  );
}
