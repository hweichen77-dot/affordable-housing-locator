import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { HousingCollection } from "../types/housing";

export function useHousingData() {
  const [data, setData] = useState<HousingCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<HousingCollection>("fetch_housing")
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}
