import { useState, useCallback } from "react";
import type { ApiResponse } from "@/types";

type FetchState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

/**
 * Generic hook for API calls with loading/error states
 */
export function useApi<T>() {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async (
      endpoint: string,
      options?: RequestInit
    ): Promise<ApiResponse<T>> => {
      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        const res = await fetch(endpoint, {
          headers: { "Content-Type": "application/json" },
          ...options,
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          const errorMsg = errorData.error || `HTTP ${res.status}`;
          setState({ data: null, loading: false, error: errorMsg });
          return { error: errorMsg };
        }

        const json = await res.json();
        setState({ data: json, loading: false, error: null });
        return { data: json };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setState({ data: null, loading: false, error: errorMsg });
        return { error: errorMsg };
      }
    },
    []
  );

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return { ...state, execute, reset };
}

/**
 * Hook for polling an endpoint until a condition is met
 */
export function usePolling<T>(
  checkComplete: (data: T) => boolean,
  intervalMs = 2000
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startPolling = useCallback(
    async (endpoint: string) => {
      setLoading(true);
      setError(null);

      const poll = async () => {
        try {
          const res = await fetch(endpoint);
          const json = await res.json();

          if (!res.ok) {
            setError(json.error || `HTTP ${res.status}`);
            setLoading(false);
            return;
          }

          setData(json);

          if (checkComplete(json)) {
            setLoading(false);
          } else {
            setTimeout(poll, intervalMs);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      };

      poll();
    },
    [checkComplete, intervalMs]
  );

  return { data, loading, error, startPolling };
}
