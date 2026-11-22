import { LIMITS, type ExamState, type ExamTiming } from '@codemark/contracts';

export function stateOf(exam: ExamTiming, now: number): ExamState {
  if (exam.phase === 'draft') return 'draft';
  if (exam.phase === 'released') return 'released';
  if (now < exam.opensAt) return 'scheduled';
  if (exam.practice) return 'open';
  if (exam.closedAt !== null) return 'closed';
  if (exam.closesAt === null) return 'closed';
  if (now >= exam.closesAt + LIMITS.graceMs) return 'closed';
  return 'open';
}

export function isOnTime(exam: ExamTiming, arrivedAt: number): boolean {
  if (exam.practice) return true;
  if (exam.closesAt === null) return false;
  return arrivedAt < exam.closesAt + LIMITS.graceMs;
}
