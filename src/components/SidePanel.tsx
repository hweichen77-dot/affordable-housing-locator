import { useMemo, useState } from "react";
import type { HousingCollection, HousingProperties } from "../types/housing";

interface SidePanelProps {
  data: HousingCollection | null;
  selected: HousingProperties | null;
  loading: boolean;
  error: string | null;
  onSelect: (props: HousingProperties) => void;
  onClear: () => void;
  onRetry: () => void;
}

export function SidePanel({ data, selected, loading, error, onSelect, onClear, onRetry }: SidePanelProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const statuses = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    data.features.forEach((f) => {
      const s = f.properties?.PROJECT_STATUS;
      if (s) seen.add(String(s));
    });
    return Array.from(seen).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase().trim();
    return data.features
      .filter((f) => f.properties != null)
      .map((f) => f.properties as HousingProperties)
      .filter((p) => {
        if (statusFilter && String(p.PROJECT_STATUS ?? "") !== statusFilter) return false;
        if (!q) return true;
        const name = String(p.PROJECT_NAME ?? "").toLowerCase();
        const addr = String(p.ADDRESS ?? "").toLowerCase();
        return name.includes(q) || addr.includes(q);
      });
  }, [data, search, statusFilter]);

  return (
    <aside className="side-panel">
      <div className="side-panel-header">
        <h1>SJ Housing Locator</h1>
        <p className="subtitle">San Jose Affordable Housing & Emergency Shelters</p>
      </div>

      <div className="side-panel-status">
        {loading && <p className="status-text">Loading properties...</p>}
        {error && (
          <div className="status-error-wrap">
            <p className="status-error">{error}</p>
            <button className="retry-btn" onClick={onRetry}>Retry</button>
          </div>
        )}
        {!loading && !error && data && (
          <p className="status-count">{data.features.length} properties loaded</p>
        )}
      </div>

      {selected ? (
        <div className="detail-card">
          <button className="back-btn" onClick={onClear}>← Back to list</button>
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
        <div className="list-section">
          <div className="filters-wrap">
            <input
              className="search-input"
              type="search"
              placeholder="Search by name or address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {statuses.length > 0 && (
              <select
                className="filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
          </div>
          {(search || statusFilter) && (
            <p className="results-count">
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </p>
          )}
          <div className="property-list">
            {!loading && !error && filtered.length === 0 && (
              <p className="empty-state">No properties match your search.</p>
            )}
            {filtered.map((props, i) => (
              <button
                key={String(props.OBJECTID ?? i)}
                className="property-item"
                onClick={() => onSelect(props)}
              >
                <span className="property-item-name">
                  {String(props.PROJECT_NAME ?? "Unknown Project")}
                </span>
                {props.ADDRESS && (
                  <span className="property-item-addr">{String(props.ADDRESS)}</span>
                )}
                <span className="property-item-meta">
                  {props.TOTAL_UNITS != null && (
                    <span className="property-item-units">{props.TOTAL_UNITS} units</span>
                  )}
                  {props.PROJECT_STATUS && (
                    <span className="property-item-status">{String(props.PROJECT_STATUS)}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
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
