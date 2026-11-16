import { useCallback, useEffect, useState } from 'react';
import type { z } from 'zod';
import { request, ApiError } from './api';
import { useRealtime } from './realtime';
import { previewOnly } from './config';
export function useRemote<T>(path: string, schema: z.ZodType<T>, enabled = true) {
  const revision = useRealtime((s) => s.revision);
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!enabled || previewOnly) return;
    try {
      setData(schema.parse(await request(path)));
      setError(null);
    } catch (error) {
      setError(error instanceof ApiError ? error.code : 'INTERNAL_ERROR');
    } finally {
      setLoading(false);
    }
  }, [path, schema, enabled]);
  useEffect(() => {
    void load();
  }, [load, revision]);
  return { data, error, loading, load, setData };
}
