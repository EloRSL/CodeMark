import { buildStudentView } from '@codemark/core';
import type { ExamContent } from '@codemark/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useOutletContext, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { api, errorKey } from '@/lib/api';
import { TaskTextContent } from './TaskTextContent';

export function ExamPreviewPage() {
  const { examId = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const draft = useOutletContext<ExamContent | null>();
  const detail = useQuery({
    queryKey: ['exam', examId],
    queryFn: () => api('exams.get', { params: { examId } }),
    enabled: draft === null,
  });
  const content = draft ?? (detail.data?.role === 'professor' ? detail.data.draft : null);

  if (draft === null && detail.isLoading) return <p>{t('common.loading')}</p>;
  if (detail.isError)
    return (
      <p role="alert" className="text-destructive">
        {t(errorKey(detail.error))}
      </p>
    );
  if (!content) return null;

  const view = buildStudentView(content);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => navigate(`/exams/${encodeURIComponent(examId)}`)}>
          {t('exams.backToEditor')}
        </Button>
        <h1 className="text-2xl font-semibold">{t('exams.preview')}</h1>
      </div>
      {view.tasks.map((task) => (
        <article key={task.id} className="space-y-3 rounded border p-4">
          <h2 className="text-xl font-medium">{task.title}</h2>
          <TaskTextContent task={task} />
          <ul className="list-disc pl-5">
            {task.criteria.map((criterion) => (
              <li key={criterion.id}>
                {criterion.name}: {criterion.maxPoints}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            {t('exams.publicTests')}: {task.publicTests.length} · {t('exams.hiddenTests')}:{' '}
            {task.hiddenTestCount}
          </p>
          {task.publicTests.map((test) => (
            <div key={test.id} className="grid gap-2 rounded border p-3 md:grid-cols-2">
              <pre className="overflow-x-auto">{test.input}</pre>
              <pre className="overflow-x-auto">{test.expectedOutput}</pre>
            </div>
          ))}
        </article>
      ))}
    </div>
  );
}
