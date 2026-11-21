import type { Locale } from '@codemark/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { setLocale } from '@/i18n';
import { api, errorKey } from '@/lib/api';
import { ME_QUERY_KEY, useMe } from '@/lib/me';

/** Changes the language at once; signed in, it also saves Me.locale (S5). */
export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  const { me } = useMe();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (locale: Locale) => api('me.update', { body: { locale } }),
    onSuccess: (updated) => queryClient.setQueryData(ME_QUERY_KEY, updated),
  });

  function choose(locale: Locale) {
    setLocale(locale);
    if (me && me.locale !== locale) save.mutate(locale);
  }

  return (
    <div role="group" aria-label={t('common.language')} className="flex items-center gap-1">
      {(['sl', 'en'] as const).map((locale) => (
        <Button
          key={locale}
          size="sm"
          variant={i18n.language === locale ? 'secondary' : 'ghost'}
          aria-pressed={i18n.language === locale}
          onClick={() => choose(locale)}
        >
          {t(`common.locales.${locale}`)}
        </Button>
      ))}
      {save.isError && (
        <span role="alert" className="text-sm text-destructive">
          {t(errorKey(save.error))}
        </span>
      )}
    </div>
  );
}
