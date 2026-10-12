'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiError, api, apiEnabled } from './api';
import type { Me } from './api';

export const ME_KEY = ['me'] as const;

/** The signed-in player (SIWE session), or null when signed out or the API is not configured. */
export function useMe(): { me: Me | null; loading: boolean } {
  const q = useQuery({
    queryKey: ME_KEY,
    enabled: apiEnabled,
    retry: false,
    queryFn: async () => {
      try {
        return await api.me();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
  });
  return { me: q.data ?? null, loading: apiEnabled && q.isLoading };
}
