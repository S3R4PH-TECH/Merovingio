import { useCallback, useEffect, useState } from 'react';
import type { NewRunInput, RunDataSource, RunRecord } from '../types';

interface DashboardData {
  runs: RunRecord[];
  loading: boolean;
  error: string | null;
  create: (input: NewRunInput) => Promise<void>;
}

export function useDashboardData(dataSource: RunDataSource): DashboardData {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    setLoading(true);
    dataSource
      .listRuns()
      .then(records => {
        if (!active) return;
        setRuns(records);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError('Unable to load runs. Check the data source and try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    // Guards against a resolved promise writing state after the source changed
    // or the component unmounted.
    return () => {
      active = false;
    };
  }, [dataSource]);

  const create = useCallback(
    async (input: NewRunInput) => {
      const record = await dataSource.createRun(input);
      setRuns(current => [...current, record]);
    },
    [dataSource],
  );

  return { runs, loading, error, create };
}
