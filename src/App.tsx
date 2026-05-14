import { useCallback, useState } from "react";
import { Map } from "./components/Map";
import { SidePanel } from "./components/SidePanel";
import { useHousingData } from "./hooks/useHousingData";
import type { HousingProperties } from "./types/housing";

export default function App() {
  const { data, loading, error } = useHousingData();
  const [selected, setSelected] = useState<HousingProperties | null>(null);
  const handleSelect = useCallback((props: HousingProperties) => setSelected(props), []);

  return (
    <div className="app-layout">
      <SidePanel
        selected={selected}
        count={data?.features.length ?? 0}
        loading={loading}
        error={error}
      />
      <div className="map-container">
        <Map data={data} onSelectFeature={handleSelect} />
      </div>
    </div>
  );
}
