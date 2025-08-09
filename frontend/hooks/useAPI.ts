// File: frontend/hooks/useAPI.ts
import { useCallback, useEffect, useMemo, useState } from 'react';

export type ApiState<T> = {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
};

/**
 * Generic API hook.
 * - Calls an API function `fn` with (apiKey, ...args)
 * - Tracks { data, isLoading, error }
 * - Exposes `refetch()` to call again on demand
 */
export function useApi<T>(
  fn: (apiKey: string, ...args: any[]) => Promise<T>,
  apiKey?: string,
  ...args: any[]
): ApiState<T> & { refetch: () => Promise<void> } {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    isLoading: true,
    error: null,
  });

  // Stable args hash for the effect deps (avoid spreading arrays in deps)
  const argsHash = useMemo(() => JSON.stringify(args), [args]);

  const refetch = useCallback(async () => {
    if (!apiKey || !apiKey.trim()) {
      setState((s) => ({ ...s, isLoading: false, error: new Error('API key required') }));
      return;
    }
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const data = await fn(apiKey, ...args);
      setState({ data, isLoading: false, error: null });
    } catch (e: any) {
      const err = e instanceof Error ? e : new Error(String(e));
      setState({ data: null, isLoading: false, error: err });
    }
  }, [apiKey, fn, argsHash]); // argsHash makes the effect rerun when args change

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { ...state, refetch };
}

export default useApi;
