import type { ExamSettings } from '@codemark/contracts';

export type GradeInput = {
  tasks: { taskId: string; criteria: { criterionId: string; maxPoints: number }[] }[];
  confirmed: { taskId: string; criterionId: string; points: number }[];
  adjustments: { taskId: string; removed: boolean; keepAsBonus: boolean }[];
  settings: ExamSettings;
};

export type GradeResult = {
  total: number;
  max: number;
  percent: number;
  grade: 5 | 6 | 7 | 8 | 9 | 10;
};

export function grade(input: GradeInput): GradeResult {
  const adjustmentByTask = new Map(
    input.adjustments.map((adjustment) => [adjustment.taskId, adjustment]),
  );

  let max = 0;
  let total = 0;
  for (const task of input.tasks) {
    const adjustment = adjustmentByTask.get(task.taskId);
    const removed = adjustment?.removed === true;
    const taskMax = task.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
    if (!removed) max += taskMax;

    const taskPoints = input.confirmed
      .filter((score) => score.taskId === task.taskId)
      .reduce((sum, score) => sum + score.points, 0);
    if (!removed || adjustment?.keepAsBonus) total += taskPoints;
  }

  const percent = max === 0 ? 0 : (total / max) * 100;
  const value = input.settings.scale === 'points' ? total : percent;
  const threshold = input.settings.thresholds;
  let result: 5 | 6 | 7 | 8 | 9 | 10 = 5;
  if (value + 1e-9 >= threshold['10']) result = 10;
  else if (value + 1e-9 >= threshold['9']) result = 9;
  else if (value + 1e-9 >= threshold['8']) result = 8;
  else if (value + 1e-9 >= threshold['7']) result = 7;
  else if (value + 1e-9 >= threshold['6']) result = 6;
  return { total, max, percent, grade: result };
}
