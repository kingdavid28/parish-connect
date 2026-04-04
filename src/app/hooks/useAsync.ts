import { useState, useEffect, useCallback, useRef } from "react";
import { AsyncData } from "../types";

interface UseAsyncOptions<T> {
  immediate?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
}

export function useAsync<T>(
  asyncFunction: () => Promise<T>,
  options: UseAsyncOptions<T> = {}
) {
  const { immediate = true, onSuccess, onError } = options;

  const [state, setState] = useState<AsyncData<T>>({
    data: null,
    loading: immediate,
    error: null,
  });

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const execute = useCallback(
    async (params?: unknown) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const data = await asyncFunction();

        if (isMountedRef.current) {
          setState({ data, loading: false, error: null });
          onSuccess?.(data);
        }

        return { data, error: null };
      } catch (err) {
        const error = err instanceof Error ? err.message : "An error occurred";

        if (isMountedRef.current) {
          setState({ data: null, loading: false, error });
          onError?.(error);
        }

        return { data: null, error };
      }
    },
    [asyncFunction, onSuccess, onError]
  );

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [immediate]);

  return {
    ...state,
    execute,
    reset,
  };
}
