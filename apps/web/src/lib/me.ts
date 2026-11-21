import type { Me } from '@codemark/contracts';
import { useQuery } from '@tanstack/react-query';
import { api, ApiClientError } from './api';

export const ME_QUERY_KEY = ['me'] as const;

/** The signed-in user, or null when signed out. Sign-in and sign-out set this query's data. */
export function useMe(): { me: Me | null; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        return await api('me.get', {});
      } catch (error) {
        if (error instanceof ApiClientError && error.code === 'UNAUTHENTICATED') return null;
        throw error;
      }
    },
    staleTime: Infinity, // only sign-in, sign-out and me.update change it, and they set it
  });
  return { me: data ?? null, isLoading };
}
