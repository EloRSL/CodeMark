// @vitest-environment jsdom
import { LIMITS, type ExamStatus, type Notice } from '@codemark/contracts';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement, StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextCursor, serverOffset, useExamStatus } from './status';

const T = Date.parse('2026-12-01T10:00:00.000Z');
const POLL = LIMITS.pollIntervalMs;
const notice = (id: number): Notice => ({
  id,
  kind: 'exam_closed',
  payload: {},
  createdAt: '2026-12-01T10:00:00.000Z',
});
const status = (latestNoticeId: number, ids: number[] = []): ExamStatus => ({
  serverTime: '2026-12-01T10:00:00.000Z',
  state: 'open',
  opensAt: '2026-12-01T09:00:00.000Z',
  closesAt: '2026-12-01T11:00:00.000Z',
  version: 1,
  notices: ids.map(notice),
  latestNoticeId,
});

describe('useExamStatus helpers', () => {
  it('measures the offset from the middle of the request', () => {
    const server = Date.parse('2026-12-01T10:00:00.000Z');
    expect(serverOffset('2026-12-01T10:00:00.000Z', server - 3000, server - 1000)).toBe(2000);
    expect(serverOffset('2026-12-01T10:00:00.000Z', server + 500, server + 1500)).toBe(-1000);
  });

  it('starts the cursor at latestNoticeId', () => {
    expect(nextCursor(null, status(7))).toBe(7);
    expect(nextCursor(null, status(0))).toBe(0);
  });

  it('advances to the newest notice received, not past what is still to come', () => {
    expect(nextCursor(7, status(9, [8, 9]))).toBe(9);
    expect(nextCursor(7, status(7))).toBe(7);
    expect(nextCursor(0, status(60, [1, 2, 50]))).toBe(50);
  });
});

// A fake exams.status (api.md #10): the notices in `served`, `latencyMs` of network time,
// and a server clock `skewMs` ahead of the browser, read halfway through the request.
let served: Notice[];
let latencyMs: number;
let skewMs: number;
// Fake timers give a 0 ms timer made during a tick 1 ms of delay, so a tick(0) would never
// run react-query's setTimeout(0) batches or a 0 ms sleep. Microtasks run inside every tick.
notifyManager.setScheduler(queueMicrotask);
const sleep = (ms: number) => (ms ? new Promise((resolve) => setTimeout(resolve, ms)) : null);
const fetchMock = vi.fn<typeof fetch>(async (input) => {
  const since = new URL(String(input), 'http://localhost').searchParams.get('since');
  await sleep(latencyMs / 2);
  const serverTime = new Date(Date.now() + skewMs).toISOString();
  await sleep(latencyMs / 2);
  const body: ExamStatus = {
    ...status(served.at(-1)?.id ?? 0),
    serverTime,
    notices: since === null ? [] : served.filter((n) => n.id > Number(since)).slice(0, 50),
  };
  // Not a real Response: reading its body stream doesn't finish inside fake-timer ticks.
  return { ok: true, status: 200, json: async () => body } as Response;
});
vi.stubGlobal('fetch', fetchMock);

let visibility: DocumentVisibilityState;
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(StrictMode, null, createElement(QueryClientProvider, { client }, children));

const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const urls = () => fetchMock.mock.calls.map(([input]) => String(input));
const ids = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.map(([n]) => (n as Notice).id);
const setVisibility = async (state: DocumentVisibilityState) => {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  await tick(0);
};
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

async function mountStatus(onNotice?: (n: Notice) => void) {
  const hook = renderHook(() => useExamStatus('e1', { onNotice }), { wrapper });
  await tick(latencyMs); // the first answer
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T);
  served = [];
  latencyMs = 0;
  skewMs = 0;
  visibility = 'visible';
  client = new QueryClient();
  fetchMock.mockClear();
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
});

describe('useExamStatus', () => {
  it('asks without since first, then polls every pollIntervalMs from the cursor', async () => {
    served = [notice(1), notice(2)];
    const { result } = await mountStatus();
    expect(urls()).toEqual(['/api/exams/e1/status']);
    expect(result.current.status?.latestNoticeId).toBe(2);
    await tick(POLL - 1);
    expect(urls()).toHaveLength(1);
    await tick(1);
    expect(urls()).toEqual(['/api/exams/e1/status', '/api/exams/e1/status?since=2']);
  });

  it('pauses while the tab is hidden and polls at once when it is visible again', async () => {
    await mountStatus();
    await setVisibility('hidden');
    await tick(3 * POLL);
    expect(urls()).toHaveLength(1);
    await setVisibility('visible');
    expect(urls()).toHaveLength(2);
  });

  it('refresh() polls now and reuses a poll that is already running', async () => {
    latencyMs = 1000;
    const { result } = await mountStatus();
    act(() => result.current.refresh());
    act(() => result.current.refresh());
    expect(urls()).toHaveLength(2);
    await tick(latencyMs);
    while (urls().length < 3) await tick(100); // the next interval poll starts
    act(() => result.current.refresh());
    expect(urls()).toHaveLength(3);
  });

  it('gives every mounted hook each new notice once, in order', async () => {
    served = [notice(1)];
    const first = vi.fn();
    const second = vi.fn();
    renderHook(
      () => [useExamStatus('e1', { onNotice: first }), useExamStatus('e1', { onNotice: second })],
      { wrapper },
    );
    await tick(0);
    served.push(notice(2), notice(3));
    await tick(POLL);
    await tick(POLL);
    served.push(notice(4));
    await tick(POLL);
    expect(ids(first)).toEqual([2, 3, 4]);
    expect(ids(second)).toEqual([2, 3, 4]);
    expect(urls()).toHaveLength(4); // the two hooks share one poll

    // A hook mounted later gets only what arrives after it mounts.
    const later = vi.fn();
    renderHook(() => useExamStatus('e1', { onNotice: later }), { wrapper });
    await tick(0);
    served.push(notice(5));
    await tick(POLL);
    expect(ids(later)).toEqual([5]);
    expect(ids(first)).toEqual([2, 3, 4, 5]);
  });

  it('reads more than 50 new notices over two polls without skipping any', async () => {
    const onNotice = vi.fn();
    await mountStatus(onNotice);
    served = range(1, 60).map(notice);
    await tick(POLL);
    expect(ids(onNotice)).toEqual(range(1, 50));
    await tick(POLL);
    expect(ids(onNotice)).toEqual(range(1, 60));
    expect(urls().slice(1)).toEqual([
      '/api/exams/e1/status?since=0',
      '/api/exams/e1/status?since=50',
    ]);
  });

  it('measures serverOffsetMs from the middle of the request', async () => {
    latencyMs = 2000;
    skewMs = 5000;
    const hook = renderHook(() => useExamStatus('e1'), { wrapper });
    expect(hook.result.current).toMatchObject({ status: null, serverOffsetMs: 0 });
    await tick(latencyMs);
    expect(hook.result.current.serverOffsetMs).toBe(5000);
  });
});
