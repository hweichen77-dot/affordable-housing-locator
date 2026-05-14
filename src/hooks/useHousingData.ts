import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import type { HousingCollection } from "../types/housing";

export function useHousingData() {
  const [data, setData] = useState<HousingCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    invoke<HousingCollection>("fetch_housing")
      .then(setData)
      .catch((e) => setError(typeof e === "string" ? e : JSON.stringify(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, refetch: load };
}
