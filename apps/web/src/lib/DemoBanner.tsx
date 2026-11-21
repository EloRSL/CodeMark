import { useTranslation } from 'react-i18next';

/** Shown on every page while VITE_DEMO_MODE is "true" (D5). */
export function DemoBanner() {
  const { t } = useTranslation();
  if (import.meta.env.VITE_DEMO_MODE !== 'true') return null;
  return (
    <div role="status" className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">
      {t('common.demoBanner')}
    </div>
  );
}
