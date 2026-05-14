import type { HousingProperties } from "../types/housing";

interface SidePanelProps {
  selected: HousingProperties | null;
  count: number;
  loading: boolean;
  error: string | null;
}

export function SidePanel({ selected, count, loading, error }: SidePanelProps) {
  return (
    <aside className="side-panel">
      <div className="side-panel-header">
        <h1>SJ Housing Locator</h1>
        <p className="subtitle">San Jose Affordable Housing & Emergency Shelters</p>
      </div>

      <div className="side-panel-status">
        {loading && <p className="status-text">Loading properties...</p>}
        {error && <p className="status-error">Error: {error}</p>}
        {!loading && !error && (
          <p className="status-count">{count} properties found</p>
        )}
      </div>

      {selected ? (
        <div className="detail-card">
          <h2>{String(selected.PROJECT_NAME ?? "Unknown Project")}</h2>
          <div className="detail-rows">
            <DetailRow label="Address" value={selected.ADDRESS} />
            <DetailRow label="Total Units" value={selected.TOTAL_UNITS} />
            <DetailRow label="Affordable Units" value={selected.AFFORDABLE_UNITS} />
            <DetailRow label="Status" value={selected.PROJECT_STATUS} />
            <DetailRow label="Developer" value={selected.DEVELOPER} />
            <DetailRow label="Tenure" value={selected.TENURE} />
            <DetailRow label="Affordability" value={selected.AFFORDABILITY_LEVEL} />
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <p>Click a marker on the map to view property details.</p>
        </div>
      )}
    </aside>
  );
}

function DetailRow({ label, value }: { label: string; value: unknown }) {
  if (value == null || value === "") return null;
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{String(value)}</span>
    </div>
  );
}
