import type { DemoUser } from '@codemark/contracts';
import { DEMO_USERS } from '@codemark/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { api, errorKey } from '@/lib/api';
import { ME_QUERY_KEY, useMe } from '@/lib/me';
import { LanguageSwitch } from './LanguageSwitch';

/** The sign-in page. Demo buttons while VITE_DEMO_MODE is "true"; OAuth arrives in M2. */
export function SignInPage() {
  const { t } = useTranslation();
  const { me, isLoading } = useMe();
  const queryClient = useQueryClient();
  const signIn = useMutation({
    mutationFn: (user: DemoUser) => api('auth.demo', { body: { user } }),
    onSuccess: (signedIn) => queryClient.setQueryData(ME_QUERY_KEY, signedIn),
  });

  if (isLoading) return null;
  if (me) return <Navigate to="/" replace />;

  return (
    <main className="mx-auto max-w-sm space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t('accounts.signIn.title')}</h1>
        <LanguageSwitch />
      </div>
      {import.meta.env.VITE_DEMO_MODE === 'true' && (
        <section aria-labelledby="demo-accounts" className="space-y-2">
          <h2 id="demo-accounts" className="text-sm font-medium text-muted-foreground">
            {t('accounts.signIn.demoHeading')}
          </h2>
          {(Object.keys(DEMO_USERS) as DemoUser[]).map((key) => (
            <Button
              key={key}
              variant="outline"
              className="w-full"
              disabled={signIn.isPending}
              onClick={() => signIn.mutate(key)}
            >
              {t('accounts.signIn.demoAs', { name: DEMO_USERS[key].name })}
            </Button>
          ))}
        </section>
      )}
      {signIn.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t(errorKey(signIn.error))}
        </p>
      )}
    </main>
  );
}
