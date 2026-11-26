import type {
  Criterion,
  ExamContent,
  Task,
  TestCase,
  UpdateSettingsBody,
} from '@codemark/contracts';
import { LIMITS } from '@codemark/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useMatch, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { api, errorKey } from '@/lib/api';
import { formatLjubljanaDateTime, parseLjubljanaDateTime } from './dateTime';
import { TaskTextContent } from './TaskTextContent';

function defaultTask(title: string): Task {
  return {
    id: crypto.randomUUID(),
    title,
    instructions: '',
    tips: '',
    starterCode: '',
    timeLimitMs: 2000,
    criteria: [
      {
        id: crypto.randomUUID(),
        name: 'Correctness',
        description: '',
        maxPoints: 1,
        kind: 'ai',
      },
    ],
    tests: [],
  };
}

const gradingStateOptions = [
  { key: 'counted', color: 'bg-emerald-600' },
  { key: 'bonusOnly', color: 'bg-amber-500' },
  { key: 'excluded', color: 'bg-red-600' },
] as const;

export function ExamPage() {
  const { examId = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const client = useQueryClient();
  const detail = useQuery({
    queryKey: ['exam', examId],
    queryFn: () => api('exams.get', { params: { examId } }),
  });
  const [draft, setDraft] = useState<ExamContent | null>(null);
  const isPreviewRoute = useMatch('/exams/:examId/preview') !== null;
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [settingsTitle, setSettingsTitle] = useState('');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [scale, setScale] = useState<'points' | 'percent'>('percent');
  const [thresholds, setThresholds] = useState({ '6': 50, '7': 60, '8': 70, '9': 80, '10': 90 });
  const [autocomplete, setAutocomplete] = useState(true);
  const [timeUnit, setTimeUnit] = useState<'milliseconds' | 'seconds'>('milliseconds');
  const initializedExamId = useRef<string | null>(null);
  const savedDraftJson = useRef<string | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [savedDraftJsonForFeedback, setSavedDraftJsonForFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (detail.data?.role === 'professor' && initializedExamId.current !== examId) {
      initializedExamId.current = examId;
      savedDraftJson.current = JSON.stringify(detail.data.draft);
      setSavedDraftJsonForFeedback(savedDraftJson.current);
      setDraft(detail.data.draft);
      setActiveTaskId(detail.data.draft.tasks[0]?.id ?? null);
      setSettingsTitle(detail.data.exam.title);
      setOpensAt(formatLjubljanaDateTime(detail.data.exam.opensAt));
      setClosesAt(
        detail.data.exam.closesAt ? formatLjubljanaDateTime(detail.data.exam.closesAt) : '',
      );
      setScale(detail.data.settings.scale);
      setThresholds(detail.data.settings.thresholds);
      setAutocomplete(detail.data.settings.autocomplete);
    }
  }, [detail.data, examId]);

  const save = useMutation({
    mutationFn: (content: ExamContent) =>
      api('exams.saveDraft', { params: { examId }, body: content }),
  });
  const publish = useMutation({
    mutationFn: () => api('exams.publish', { params: { examId } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['exam', examId] }),
  });
  const version = useMutation({
    mutationFn: () => api('exams.newVersion', { params: { examId }, body: { note } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['exam', examId] }),
  });
  const updateTaskAdjustment = useMutation({
    mutationFn: (values: { taskId: string; removed: boolean; keepAsBonus: boolean }) =>
      api('exams.adjustTask', {
        params: { examId, taskId: values.taskId },
        body: { removed: values.removed, keepAsBonus: values.keepAsBonus },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['exam', examId] }),
  });
  const updateSettings = useMutation({
    mutationFn: () => {
      if (detail.data?.role !== 'professor') throw new Error('Professor exam data is unavailable');
      const { exam, settings } = detail.data;
      const body: UpdateSettingsBody = {};
      if (settingsTitle !== exam.title) body.title = settingsTitle;
      if (opensAt !== formatLjubljanaDateTime(exam.opensAt))
        body.opensAt = parseLjubljanaDateTime(opensAt);
      if (closesAt !== (exam.closesAt ? formatLjubljanaDateTime(exam.closesAt) : '') && closesAt) {
        body.closesAt = parseLjubljanaDateTime(closesAt);
      }
      if (
        scale !== settings.scale ||
        JSON.stringify(thresholds) !== JSON.stringify(settings.thresholds) ||
        autocomplete !== settings.autocomplete
      ) {
        body.settings = { scale, thresholds, autocomplete };
      }
      return api('exams.updateSettings', { params: { examId }, body });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['exam', examId] }),
  });
  const closeNow = useMutation({
    mutationFn: (closesAt: string) =>
      api('exams.updateSettings', { params: { examId }, body: { closesAt } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['exam', examId] }),
  });
  const persistDraft = useCallback(
    (content: ExamContent) => {
      const contentJson = JSON.stringify(content);
      const operation = saveQueue.current.then(async () => {
        if (savedDraftJson.current === contentJson) return;
        await save.mutateAsync(content);
        savedDraftJson.current = contentJson;
        setSavedDraftJsonForFeedback(contentJson);
      });
      saveQueue.current = operation.catch(() => undefined);
      return operation;
    },
    [save.mutateAsync],
  );

  useEffect(() => {
    if (!draft || isPreviewRoute || initializedExamId.current !== examId) return;
    if (JSON.stringify(draft) === savedDraftJson.current) return;
    const timer = window.setTimeout(() => {
      void persistDraft(draft).catch(() => undefined);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [draft, examId, isPreviewRoute, persistDraft]);

  if (detail.isLoading) return <p>{t('common.loading')}</p>;
  if (detail.isError)
    return (
      <p role="alert" className="text-destructive">
        {t(errorKey(detail.error))}
      </p>
    );
  if (!detail.data) return null;
  if (detail.data.role === 'student') {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">{detail.data.exam.title}</h1>
        {detail.data.view?.tasks.map((task) => (
          <article key={task.id} className="rounded border p-4">
            <h2 className="text-xl font-medium">{task.title}</h2>
            <TaskTextContent task={task} />
          </article>
        ))}
        {!detail.data.view && <p>{t('exams.notVisibleYet')}</p>}
      </div>
    );
  }

  const professor = detail.data;
  if (isPreviewRoute) return <Outlet context={draft} />;
  const settingsChanged =
    draft !== null &&
    (settingsTitle !== professor.exam.title ||
      opensAt !== formatLjubljanaDateTime(professor.exam.opensAt) ||
      closesAt !==
        (professor.exam.closesAt ? formatLjubljanaDateTime(professor.exam.closesAt) : '') ||
      scale !== professor.settings.scale ||
      JSON.stringify(thresholds) !== JSON.stringify(professor.settings.thresholds) ||
      autocomplete !== professor.settings.autocomplete);
  const draftChanged = draft !== null && JSON.stringify(draft) !== savedDraftJson.current;
  const goBack = () => {
    if ((settingsChanged || draftChanged) && !window.confirm(t('exams.unsavedChangesConfirm')))
      return;
    if (draft) {
      void persistDraft(draft).then(
        () => navigate('/'),
        () => undefined,
      );
      return;
    }
    navigate('/');
  };

  const publishDraft = () => {
    if (!draft) return;
    void persistDraft(draft).then(
      () => publish.mutate(),
      () => undefined,
    );
  };

  const publishVersion = () => {
    if (!draft) return;
    void persistDraft(draft).then(
      () => version.mutate(),
      () => undefined,
    );
  };

  const updateTask = (index: number, patch: Partial<Task>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      tasks: draft.tasks.map((task, i) => (i === index ? { ...task, ...patch } : task)),
    });
  };
  const updateCriterion = (
    taskIndex: number,
    criterionIndex: number,
    patch: Partial<Criterion>,
  ) => {
    if (!draft) return;
    setDraft({
      ...draft,
      tasks: draft.tasks.map((task, i) =>
        i === taskIndex
          ? {
              ...task,
              criteria: task.criteria.map((criterion, j) =>
                j === criterionIndex ? { ...criterion, ...patch } : criterion,
              ),
            }
          : task,
      ),
    });
  };
  const updateTest = (taskIndex: number, testIndex: number, patch: Partial<TestCase>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      tasks: draft.tasks.map((task, i) =>
        i === taskIndex
          ? {
              ...task,
              tests: task.tests.map((test, j) => (j === testIndex ? { ...test, ...patch } : test)),
            }
          : task,
      ),
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={goBack}>
            {t('exams.back')}
          </Button>
          <h1 className="text-2xl font-semibold">{professor.exam.title}</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!draft}
            onClick={() => {
              if (!draft) return;
              void persistDraft(draft).then(
                () => navigate('preview'),
                () => undefined,
              );
            }}
          >
            {t('exams.preview')}
          </Button>
          {professor.exam.state === 'draft' && (
            <Button onClick={publishDraft} disabled={publish.isPending || save.isPending}>
              {t('exams.publish')}
            </Button>
          )}
        </div>
      </div>
      {(publish.isError || version.isError || updateTaskAdjustment.isError) && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {t(errorKey(publish.error ?? version.error ?? updateTaskAdjustment.error!))}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-6">
          <details open className="rounded border p-4">
            <summary className="cursor-pointer font-medium">{t('exams.settings')}</summary>
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  className="rounded border px-3 py-2"
                  value={settingsTitle}
                  onChange={(e) => setSettingsTitle(e.target.value)}
                />
                <select
                  className="rounded border px-3 py-2"
                  value={scale}
                  onChange={(e) => setScale(e.target.value as 'points' | 'percent')}
                >
                  <option value="percent">{t('exams.percent')}</option>
                  <option value="points">{t('exams.points')}</option>
                </select>
                {(professor.exam.state === 'draft' || professor.exam.state === 'scheduled') && (
                  <input
                    className="rounded border px-3 py-2"
                    type="datetime-local"
                    value={opensAt}
                    onChange={(e) => setOpensAt(e.target.value)}
                  />
                )}
                {(professor.exam.state === 'draft' ||
                  professor.exam.state === 'scheduled' ||
                  professor.exam.state === 'open') && (
                  <input
                    className="rounded border px-3 py-2"
                    type="datetime-local"
                    value={closesAt}
                    disabled={professor.exam.practice}
                    onChange={(e) => setClosesAt(e.target.value)}
                  />
                )}
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autocomplete}
                    onChange={(e) => setAutocomplete(e.target.checked)}
                  />
                  {t('exams.autocomplete')}
                </label>
              </div>
              <p className="text-sm text-muted-foreground">{t('exams.timeZone')}</p>
              <div className="grid grid-cols-5 gap-2">
                {(['6', '7', '8', '9', '10'] as const).map((grade) => (
                  <label key={grade} className="space-y-1">
                    <span>{grade}</span>
                    <input
                      className="w-full rounded border px-2 py-1"
                      type="number"
                      step="0.5"
                      value={thresholds[grade]}
                      onChange={(e) =>
                        setThresholds({ ...thresholds, [grade]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={
                    !settingsChanged ||
                    !settingsTitle.trim() ||
                    !opensAt ||
                    (!professor.exam.practice && !closesAt)
                  }
                  onClick={() => updateSettings.mutate()}
                >
                  {t('exams.saveSettings')}
                </Button>
                {(professor.exam.state === 'draft' || professor.exam.state === 'open') &&
                  !professor.exam.practice && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        const instant = new Date().toISOString();
                        setClosesAt(formatLjubljanaDateTime(instant));
                        closeNow.mutate(instant);
                      }}
                    >
                      {t('exams.closeNow')}
                    </Button>
                  )}
              </div>
              {updateSettings.isError && (
                <p
                  role="alert"
                  className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
                >
                  {t(errorKey(updateSettings.error))}
                </p>
              )}
              {updateSettings.isSuccess && !settingsChanged && (
                <p
                  role="status"
                  className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"
                >
                  {t('exams.settingsSaveSuccess')}
                </p>
              )}
              {closeNow.isError && (
                <p
                  role="alert"
                  className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
                >
                  {t(errorKey(closeNow.error))}
                </p>
              )}
              {closeNow.isSuccess && (
                <p
                  role="status"
                  className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"
                >
                  {t('exams.settingsSaveSuccess')}
                </p>
              )}
            </div>
          </details>
          {professor.exam.state !== 'draft' && (
            <details open className="rounded border p-4">
              <summary className="cursor-pointer font-medium">{t('exams.versions')}</summary>
              <div className="mt-3 space-y-3">
                <ol className="list-disc pl-5">
                  {professor.versions.map((item) => (
                    <li key={item.version}>
                      {item.version}: {item.note || '—'}
                    </li>
                  ))}
                </ol>
                {(professor.exam.state === 'scheduled' || professor.exam.state === 'open') && (
                  <div className="flex gap-2">
                    <input
                      className="rounded border px-3 py-2"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t('exams.versionNote')}
                    />
                    <Button
                      variant="outline"
                      disabled={version.isPending || save.isPending}
                      onClick={publishVersion}
                    >
                      {t('exams.newVersion')}
                    </Button>
                  </div>
                )}
                {(professor.exam.state === 'closed' || professor.exam.state === 'released') && (
                  <div className="space-y-2">
                    {professor.finalVersionTasks.map((task) => {
                      const adjustment = professor.adjustments.find(
                        (item) => item.taskId === task.id,
                      );
                      const gradingState = adjustment?.removed
                        ? adjustment.keepAsBonus
                          ? 'bonusOnly'
                          : 'excluded'
                        : 'counted';
                      const gradingStateLabel = t(`exams.gradingStates.${gradingState}`);
                      return (
                        <div key={task.id} className="flex items-center gap-2">
                          <span
                            className={`h-3 w-3 shrink-0 rounded-full ${
                              gradingState === 'counted'
                                ? 'bg-emerald-600'
                                : gradingState === 'bonusOnly'
                                  ? 'bg-amber-500'
                                  : 'bg-red-600'
                            }`}
                            role="img"
                            aria-label={gradingStateLabel}
                            title={gradingStateLabel}
                          />
                          <Button
                            className="w-full justify-start"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              updateTaskAdjustment.mutate({
                                taskId: task.id,
                                removed: !(adjustment?.removed ?? false),
                                keepAsBonus: adjustment?.keepAsBonus ?? false,
                              })
                            }
                          >
                            {task.title}:{' '}
                            {adjustment?.removed
                              ? t('exams.restoreTask')
                              : t('exams.removeForGrade')}
                          </Button>
                        </div>
                      );
                    })}
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {gradingStateOptions.map(({ key, color }) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${color}`} aria-hidden />
                          {t(`exams.gradingStates.${key}`)}
                        </div>
                      ))}
                    </div>
                    <a
                      className="inline-block text-blue-700 underline"
                      href={`/api/exams/${examId}/grades.csv`}
                    >
                      {t('exams.downloadCsv')}
                    </a>
                  </div>
                )}
              </div>
            </details>
          )}
          {draft && (
            <div className="space-y-4">
              {draft.tasks
                .filter((task) => task.id === activeTaskId)
                .map((task) => {
                  const taskIndex = draft.tasks.findIndex((item) => item.id === task.id);
                  return (
                    <section key={task.id} className="space-y-3 rounded border p-4">
                      <div className="flex justify-between">
                        <h2 className="font-medium">
                          {t('exams.task')} {taskIndex + 1}
                        </h2>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const remaining = draft.tasks.filter((_, i) => i !== taskIndex);
                            setDraft({ ...draft, tasks: remaining });
                            if (task.id === activeTaskId) {
                              setActiveTaskId(
                                remaining[Math.min(taskIndex, remaining.length - 1)]?.id ?? null,
                              );
                            }
                          }}
                        >
                          {t('exams.removeTask')}
                        </Button>
                      </div>
                      <input
                        className="w-full rounded border px-3 py-2"
                        aria-label={t('exams.fields.taskTitle')}
                        value={task.title}
                        onChange={(e) => updateTask(taskIndex, { title: e.target.value })}
                      />
                      <textarea
                        className="w-full min-h-32 max-h-64 resize-y overflow-y-auto rounded border px-3 py-2"
                        aria-label={t('exams.fields.instructions')}
                        maxLength={10000}
                        value={task.instructions}
                        onChange={(e) => updateTask(taskIndex, { instructions: e.target.value })}
                      />
                      <textarea
                        className="w-full min-h-24 max-h-64 resize-y overflow-y-auto rounded border px-3 py-2"
                        aria-label={t('exams.fields.tips')}
                        maxLength={10000}
                        value={task.tips}
                        onChange={(e) => updateTask(taskIndex, { tips: e.target.value })}
                      />
                      <textarea
                        className="w-full min-h-24 max-h-64 resize-y overflow-y-auto rounded border px-3 py-2"
                        aria-label={t('exams.fields.starterCode')}
                        maxLength={LIMITS.codeBytes}
                        value={task.starterCode}
                        onChange={(e) => updateTask(taskIndex, { starterCode: e.target.value })}
                      />
                      <p className="text-sm text-muted-foreground">
                        {t('exams.markdownSupported')}
                      </p>
                      <div className="space-y-1">
                        <span className="block">{t('exams.fields.solvingTime')}</span>
                        <div className="flex gap-2">
                          <input
                            className="min-w-0 flex-1 rounded border px-3 py-2"
                            aria-label={t('exams.fields.solvingTime')}
                            type="number"
                            min={
                              timeUnit === 'seconds'
                                ? LIMITS.timeLimitMs.min / 1000
                                : LIMITS.timeLimitMs.min
                            }
                            max={
                              timeUnit === 'seconds'
                                ? LIMITS.timeLimitMs.max / 1000
                                : LIMITS.timeLimitMs.max
                            }
                            step={timeUnit === 'seconds' ? 0.001 : 1}
                            value={
                              timeUnit === 'seconds'
                                ? (task.timeLimitMs / 1000).toFixed(3)
                                : task.timeLimitMs
                            }
                            onChange={(e) => {
                              const value = Number(e.target.value);
                              updateTask(taskIndex, {
                                timeLimitMs: Math.round(
                                  timeUnit === 'seconds' ? value * 1000 : value,
                                ),
                              });
                            }}
                          />
                          <select
                            className="rounded border px-3 py-2"
                            aria-label={t('exams.fields.timeUnit')}
                            value={timeUnit}
                            onChange={(e) =>
                              setTimeUnit(e.target.value as 'milliseconds' | 'seconds')
                            }
                          >
                            <option value="milliseconds">
                              {t('exams.timeUnits.milliseconds')}
                            </option>
                            <option value="seconds">{t('exams.timeUnits.seconds')}</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-medium">{t('exams.criteria')}</h3>
                        {task.criteria.map((criterion, criterionIndex) => (
                          <div
                            key={criterion.id}
                            className="grid gap-2 rounded border p-3 md:grid-cols-4"
                          >
                            <input
                              className="rounded border px-2 py-1"
                              value={criterion.name}
                              onChange={(e) =>
                                updateCriterion(taskIndex, criterionIndex, { name: e.target.value })
                              }
                            />
                            <select
                              className="rounded border px-2 py-1"
                              value={criterion.kind}
                              onChange={(e) =>
                                updateCriterion(taskIndex, criterionIndex, {
                                  kind: e.target.value as 'ai' | 'runs',
                                })
                              }
                            >
                              <option value="ai">AI</option>
                              <option value="runs">{t('exams.criterionKinds.runs')}</option>
                            </select>
                            <input
                              className="rounded border px-2 py-1"
                              type="number"
                              step="0.5"
                              min="0.5"
                              value={criterion.maxPoints}
                              onChange={(e) =>
                                updateCriterion(taskIndex, criterionIndex, {
                                  maxPoints: Number(e.target.value),
                                })
                              }
                            />
                            <input
                              className="rounded border px-2 py-1"
                              value={criterion.description}
                              onChange={(e) =>
                                updateCriterion(taskIndex, criterionIndex, {
                                  description: e.target.value,
                                })
                              }
                            />
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-medium">{t('exams.tests')}</h3>
                        {task.tests.map((test, testIndex) => (
                          <div
                            key={test.id}
                            className="grid gap-2 rounded border p-3 md:grid-cols-3"
                          >
                            <select
                              className="rounded border px-2 py-1"
                              value={test.visibility}
                              onChange={(e) =>
                                updateTest(taskIndex, testIndex, {
                                  visibility: e.target.value as 'public' | 'hidden',
                                })
                              }
                            >
                              <option value="public">{t('exams.public')}</option>
                              <option value="hidden">{t('exams.hidden')}</option>
                            </select>
                            <textarea
                              className="min-h-20 max-h-64 resize-y overflow-y-auto rounded border px-2 py-1"
                              value={test.input}
                              onChange={(e) =>
                                updateTest(taskIndex, testIndex, { input: e.target.value })
                              }
                            />
                            <textarea
                              className="min-h-20 max-h-64 resize-y overflow-y-auto rounded border px-2 py-1"
                              value={test.expectedOutput}
                              onChange={(e) =>
                                updateTest(taskIndex, testIndex, { expectedOutput: e.target.value })
                              }
                            />
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateTask(taskIndex, {
                              tests: [
                                ...task.tests,
                                {
                                  id: crypto.randomUUID(),
                                  visibility: 'public',
                                  input: '',
                                  expectedOutput: '',
                                },
                              ],
                            })
                          }
                        >
                          {t('exams.addTest')}
                        </Button>
                      </div>
                    </section>
                  );
                })}
              <Button
                onClick={() => {
                  void persistDraft(draft).catch(() => undefined);
                }}
                disabled={save.isPending}
              >
                {t('exams.saveDraft')}
              </Button>
              {save.isError && (
                <p
                  role="alert"
                  className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
                >
                  {t(errorKey(save.error))}
                </p>
              )}
              {save.isSuccess && JSON.stringify(draft) === savedDraftJsonForFeedback && (
                <p
                  role="status"
                  className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"
                >
                  {t('exams.saveSuccess')}
                </p>
              )}
            </div>
          )}
        </div>
        {draft && (
          <aside className="space-y-3 rounded border p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            <h2 className="font-medium">{t('exams.tasks')}</h2>
            <div role="tablist" aria-label={t('exams.tasks')} className="space-y-2">
              {draft.tasks.map((task, taskIndex) => (
                <Button
                  key={task.id}
                  type="button"
                  role="tab"
                  aria-selected={task.id === activeTaskId}
                  variant={task.id === activeTaskId ? 'secondary' : 'outline'}
                  className="h-auto min-h-9 w-full justify-start whitespace-normal text-left"
                  onClick={() => setActiveTaskId(task.id)}
                >
                  {task.title || `${t('exams.task')} ${taskIndex + 1}`}
                </Button>
              ))}
            </div>
            {draft.tasks.length < 10 && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  const task = defaultTask(
                    t('exams.defaultTaskTitle', { number: draft.tasks.length + 1 }),
                  );
                  setDraft({ ...draft, tasks: [...draft.tasks, task] });
                  setActiveTaskId(task.id);
                }}
              >
                {t('exams.addTask')}
              </Button>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
