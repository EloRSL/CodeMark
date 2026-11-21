import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiClientError, errorKey, NetworkError } from './api';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockReset());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const lastCall = () => fetchMock.mock.calls.at(-1)!;

describe('api()', () => {
  it('builds the path and the JSON body from the registry', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    const body = { decision: 'accepted' } as const;
    const params = { submissionId: 'a b/c' };
    expect(await api('submissions.lateDecision', { params, body })).toEqual({ ok: true });
    const [url, init] = lastCall();
    expect(url).toBe('/api/submissions/a%20b%2Fc/late-decision');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"decision":"accepted"}',
    });
  });

  it('adds the query and leaves out undefined values', async () => {
    fetchMock.mockImplementation(async () => json({}));
    await api('exams.status', { params: { examId: 'e1' }, query: { since: 5 } });
    expect(lastCall()[0]).toBe('/api/exams/e1/status?since=5');
    await api('exams.status', { params: { examId: 'e1' }, query: { since: undefined } });
    expect(lastCall()[0]).toBe('/api/exams/e1/status');
    await api('me.get', {});
    expect(lastCall()).toEqual(['/api/me', { method: 'GET', headers: undefined, body: undefined }]);
  });

  it('returns the raw Response for the CSV', async () => {
    const csv = new Response('a;b', { status: 200 });
    fetchMock.mockResolvedValue(csv);
    expect(await api('exams.gradesCsv', { params: { examId: 'e1' } })).toBe(csv);
  });

  it("throws ApiClientError with the API's code, status and details", async () => {
    const details = { field: 'enrolmentNo' };
    fetchMock.mockResolvedValue(
      json({ error: { code: 'ENROLMENT_TAKEN', message: 'taken', details } }, 409),
    );
    const error = await api('me.get', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ code: 'ENROLMENT_TAKEN', status: 409, details });
  });

  it('keeps a 503 that carries an ApiErrorBody as ApiClientError', async () => {
    fetchMock.mockResolvedValue(json({ error: { code: 'AI_UNAVAILABLE', message: 'down' } }, 503));
    await expect(api('me.get', {})).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', status: 503 });
  });

  it('throws NetworkError when fetch gets no answer', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api('me.get', {})).rejects.toBeInstanceOf(NetworkError);
  });

  it.each([502, 503, 504])(
    'throws NetworkError for a %i page without an ApiErrorBody',
    async (status) => {
      fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status }));
      await expect(api('me.get', {})).rejects.toBeInstanceOf(NetworkError);
    },
  );

  it.each([500, 404])(
    'turns any other %i without an ApiErrorBody into INTERNAL',
    async (status) => {
      fetchMock.mockResolvedValue(new Response('<html>oops</html>', { status }));
      const error = await api('me.get', {}).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiClientError);
      expect(error).toMatchObject({ code: 'INTERNAL', status });
    },
  );
});

describe('errorKey', () => {
  it('maps each error to the translation a screen shows', () => {
    expect(errorKey(new NetworkError('x'))).toBe('common.networkError');
    expect(errorKey(new ApiClientError('EXAM_CLOSED', 409, 'x'))).toBe('errors.EXAM_CLOSED');
    expect(errorKey(new Error('x'))).toBe('errors.INTERNAL');
  });
});
