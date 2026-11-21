import {
  ApiErrorBody,
  endpoints,
  type BodyOf,
  type EndpointKey,
  type ErrorCode,
  type ParamsOf,
  type QueryOf,
  type ResponseOf,
} from '@codemark/contracts';

/** The API answered with an error. Screens show errors.<code>. */
export class ApiClientError extends Error {
  constructor(
    public code: ErrorCode,
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/** No usable answer. Screens show common.networkError, and submit retries it. */
export class NetworkError extends Error {
  name = 'NetworkError';
}

/** Calls an endpoint from the registry (internal-interfaces.md section 5). */
export async function api<K extends EndpointKey>(
  key: K,
  args: { params?: ParamsOf<K>; query?: QueryOf<K>; body?: BodyOf<K> },
): Promise<ResponseOf<K>> {
  const { method, path, response } = endpoints[key];
  const params = (args.params ?? {}) as Record<string, string>;
  const query = Object.entries((args.query ?? {}) as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => [name, String(value)]);
  const search = new URLSearchParams(query).toString();
  const url =
    '/api' +
    path.replace(/:(\w+)/g, (_, name: string) => encodeURIComponent(params[name] ?? '')) +
    (search ? `?${search}` : '');
  const hasBody = args.body !== undefined;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(args.body) : undefined,
    });
  } catch (error) {
    throw new NetworkError(`${key}: no answer from the server`, { cause: error });
  }

  if (res.ok) return (typeof response === 'string' ? res : await res.json()) as ResponseOf<K>;
  const body = ApiErrorBody.safeParse(await res.json().catch(() => null));
  if (body.success) {
    const { code, message, details } = body.data.error;
    throw new ApiClientError(code, res.status, message, details);
  }
  // A proxy or Cloudflare error page, not our API: treat it like a dropped connection.
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw new NetworkError(`${key}: ${res.status} without an ApiErrorBody`);
  }
  throw new ApiClientError('INTERNAL', res.status, `${key}: ${res.status} without an ApiErrorBody`);
}

/** The translation key to show for an error from api(). */
export function errorKey(error: unknown): 'common.networkError' | `errors.${ErrorCode}` {
  if (error instanceof NetworkError) return 'common.networkError';
  if (error instanceof ApiClientError) return `errors.${error.code}`;
  return 'errors.INTERNAL';
}
