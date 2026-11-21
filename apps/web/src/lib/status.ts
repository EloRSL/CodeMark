import { LIMITS, type ExamStatus, type Notice } from '@codemark/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { api } from './api';

type StatusData = { status: ExamStatus; serverOffsetMs: number; cursor: number };

/** Server time minus browser time, taking the request's midpoint as the moment the server answered. */
export function serverOffset(serverTime: string, sentAt: number, receivedAt: number): number {
  return Date.parse(serverTime) - (sentAt + receivedAt) / 2;
}

/** The first answer starts at latestNoticeId; later ones advance to the newest notice received. */
export function nextCursor(cursor: number | null, status: ExamStatus): number {
  if (cursor === null) return status.latestNoticeId;
  return Math.max(cursor, status.notices.at(-1)?.id ?? cursor);
}

/**
 * Polls exams.status every LIMITS.pollIntervalMs while the tab is visible, at once when it
 * becomes visible again (react-query's refetchOnWindowFocus), and on refresh().
 */
export function useExamStatus(
  examId: string,
  options?: { onNotice?: (notice: Notice) => void },
): { status: ExamStatus | null; serverOffsetMs: number; refresh(): void } {
  const client = useQueryClient();
  const queryKey = ['exams.status', examId];
  const { data, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<StatusData> => {
      const cursor = client.getQueryData<StatusData>(queryKey)?.cursor ?? null;
      const sentAt = Date.now();
      const status = await api('exams.status', {
        params: { examId },
        query: cursor === null ? {} : { since: cursor },
      });
      const serverOffsetMs = serverOffset(status.serverTime, sentAt, Date.now());
      return { status, serverOffsetMs, cursor: nextCursor(cursor, status) };
    },
    refetchInterval: LIMITS.pollIntervalMs, // react-query skips it while the tab is hidden
  });

  const onNotice = useRef(options?.onNotice);
  useEffect(() => {
    onNotice.current = options?.onNotice;
  });

  // Notices already in the cache when this hook mounts went to whoever was listening then.
  const delivered = useRef<{ examId: string; cursor: number } | null>(null);
  useEffect(() => {
    if (!data) return;
    const from = delivered.current?.examId === examId ? delivered.current.cursor : null;
    delivered.current = { examId, cursor: data.cursor };
    if (from === null) return;
    for (const notice of data.status.notices) if (notice.id > from) onNotice.current?.(notice);
  }, [data, examId]);

  const refresh = useCallback(() => void refetch({ cancelRefetch: false }), [refetch]);
  return { status: data?.status ?? null, serverOffsetMs: data?.serverOffsetMs ?? 0, refresh };
}
