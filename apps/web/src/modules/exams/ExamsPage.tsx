import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { api, errorKey } from '@/lib/api';
import { useMe } from '@/lib/me';
import { formatLjubljanaDateTime, parseLjubljanaDateTime } from './dateTime';

export function ExamsPage() {
  const { t, i18n } = useTranslation();
  const { me } = useMe();
  const client = useQueryClient();
  const [title, setTitle] = useState('');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [practice, setPractice] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<
    'opening-newest' | 'opening-oldest' | 'title-asc' | 'title-desc'
  >('opening-newest');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['exams'],
    queryFn: () => api('exams.list', {}),
  });
  const create = useMutation({
    mutationFn: () =>
      api('exams.create', {
        body: {
          title,
          opensAt: parseLjubljanaDateTime(opensAt),
          closesAt: practice ? null : parseLjubljanaDateTime(closesAt),
          practice,
        },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['exams'] }),
  });
  const filteredExams = (list.data?.exams ?? [])
    .filter((exam) =>
      exam.title
        .toLocaleLowerCase(i18n.language)
        .includes(search.trim().toLocaleLowerCase(i18n.language)),
    )
    .sort((a, b) => {
      if (sort === 'title-asc') return a.title.localeCompare(b.title, i18n.language);
      if (sort === 'title-desc') return b.title.localeCompare(a.title, i18n.language);
      const byOpening = Date.parse(a.opensAt) - Date.parse(b.opensAt);
      return sort === 'opening-newest' ? -byOpening : byOpening;
    });
  const pageCount = Math.max(1, Math.ceil(filteredExams.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleExams = filteredExams.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('exams.title')}</h1>
      {me?.role === 'professor' && (
        <details open className="rounded border p-4">
          <summary className="cursor-pointer font-medium">{t('exams.addExam')}</summary>
          <form
            className="mt-4 grid gap-3 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <label className="space-y-1">
              <span>{t('exams.fields.title')}</span>
              <input
                className="w-full rounded border px-3 py-2"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span>{t('exams.fields.opensAt')}</span>
              <input
                className="w-full rounded border px-3 py-2"
                type="datetime-local"
                value={opensAt}
                onChange={(e) => setOpensAt(e.target.value)}
              />
            </label>
            {!practice && (
              <label className="space-y-1">
                <span>{t('exams.fields.closesAt')}</span>
                <input
                  className="w-full rounded border px-3 py-2"
                  type="datetime-local"
                  value={closesAt}
                  onChange={(e) => setClosesAt(e.target.value)}
                />
              </label>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={practice}
                onChange={(e) => setPractice(e.target.checked)}
              />
              {t('exams.fields.practice')}
            </label>
            <Button
              type="submit"
              disabled={create.isPending || !title || !opensAt || (!practice && !closesAt)}
            >
              {t('exams.create')}
            </Button>
            {create.isError && (
              <p
                role="alert"
                className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
              >
                {t(errorKey(create.error))}
              </p>
            )}
            {create.isSuccess && (
              <p
                role="status"
                className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"
              >
                {t('exams.createSuccess')}
              </p>
            )}
          </form>
        </details>
      )}

      {list.isLoading && <p>{t('common.loading')}</p>}
      {list.data && (
        <section className="space-y-3 rounded border p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="block text-sm">{t('exams.search')}</span>
              <input
                className="w-full rounded border px-3 py-2"
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="space-y-1">
              <span className="block text-sm">{t('exams.sort')}</span>
              <select
                className="w-full rounded border px-3 py-2"
                value={sort}
                onChange={(event) => {
                  setSort(
                    event.target.value as
                      'opening-newest' | 'opening-oldest' | 'title-asc' | 'title-desc',
                  );
                  setPage(1);
                }}
              >
                <option value="opening-newest">{t('exams.sortOptions.openingNewest')}</option>
                <option value="opening-oldest">{t('exams.sortOptions.openingOldest')}</option>
                <option value="title-asc">{t('exams.sortOptions.titleAsc')}</option>
                <option value="title-desc">{t('exams.sortOptions.titleDesc')}</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-sm">{t('exams.pageSize')}</span>
              <select
                className="w-full rounded border px-3 py-2"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>
            </label>
          </div>
          <div className="min-h-96 space-y-2 rounded border p-2">
            {visibleExams.map((exam) => (
              <Link
                key={exam.id}
                to={`/exams/${exam.id}`}
                className="block rounded border p-4 hover:bg-accent"
              >
                <div className="flex justify-between gap-3">
                  <strong>{exam.title}</strong>
                  <span className="text-sm">{t(`exams.states.${exam.state}`)}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatLjubljanaDateTime(exam.opensAt).replace('T', ' ')}
                </div>
              </Link>
            ))}
            {visibleExams.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">{t('exams.noExamsMatch')}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {t('exams.showingExams', {
                shown: visibleExams.length,
                total: filteredExams.length,
              })}
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                {t('exams.previousPage')}
              </Button>
              <span aria-live="polite" className="text-sm">
                {t('exams.pageIndicator', { page: currentPage, pages: pageCount })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                {t('exams.nextPage')}
              </Button>
            </div>
          </div>
        </section>
      )}
      {list.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t(errorKey(list.error))}
        </p>
      )}
    </div>
  );
}
