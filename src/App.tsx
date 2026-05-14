import { useCallback, useState } from "react";
import { Map } from "./components/Map";
import { SidePanel } from "./components/SidePanel";
import { useHousingData } from "./hooks/useHousingData";
import type { HousingProperties } from "./types/housing";

export default function App() {
  const { data, loading, error, refetch } = useHousingData();
  const [selected, setSelected] = useState<HousingProperties | null>(null);
  const handleSelect = useCallback((props: HousingProperties) => setSelected(props), []);
  const handleClear = useCallback(() => setSelected(null), []);

  return (
    <div className="app-layout">
      <SidePanel
        data={data}
        selected={selected}
        loading={loading}
        error={error}
        onSelect={handleSelect}
        onClear={handleClear}
        onRetry={refetch}
      />
      <div className="map-container">
        <Map data={data} onSelectFeature={handleSelect} />
        <div className="map-legend">
          <div className="legend-item">
            <span className="legend-dot legend-cluster" />
            <span>Cluster</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot legend-point" />
            <span>Property</span>
          </div>
        </div>
      </div>
    </div>
  );
}
