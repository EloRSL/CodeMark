import type { Task } from '@codemark/contracts';
import { useTranslation } from 'react-i18next';
import { MarkdownContent } from './MarkdownContent';

type TaskText = Pick<Task, 'instructions' | 'tips' | 'starterCode'>;

export function TaskTextContent({ task }: { task: TaskText }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {task.instructions && <MarkdownContent source={task.instructions} />}
      {task.tips && (
        <section>
          <h3 className="font-medium">{t('exams.fields.tips')}</h3>
          <MarkdownContent source={task.tips} />
        </section>
      )}
      {task.starterCode && (
        <section>
          <h3 className="font-medium">{t('exams.fields.starterCode')}</h3>
          <pre className="overflow-x-auto rounded bg-muted p-3">
            <code>{task.starterCode}</code>
          </pre>
        </section>
      )}
    </div>
  );
}
