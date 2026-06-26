import { useTranslation } from "react-i18next";
import type { DisplayProperty } from "../types/housing";
import type { UserLocation, AppStatusValue } from "../App";
import { getAffordabilityTier } from "./PropertyCard";
import { haversineKm, fmtDist } from "../lib/geo";

interface ComparePanelProps {
  properties: DisplayProperty[];
  userLocation: UserLocation | null;
  appStatuses: Record<string, AppStatusValue>;
  deadlines: Record<string, number>;
  onClear: () => void;
  onRemove: (id: string) => void;
  onSelect: (p: DisplayProperty) => void;
}

const STATUS_LABELS: Record<AppStatusValue, string> = {
  interested: "Interested",
  applied: "Applied",
  waitlisted: "Waitlisted",
};

function amiPct(p: DisplayProperty): string {
  if (p.incomeCeilingPct != null) return `≤${p.incomeCeilingPct}%`;
  if (p.source === "lihtc") return "≤60%";
  return "—";
}

export function ComparePanel({
  properties,
  userLocation,
  appStatuses,
  deadlines,
  onClear,
  onRemove,
  onSelect,
}: ComparePanelProps) {
  const { t } = useTranslation();

  const dist = (p: DisplayProperty) =>
    userLocation && p.lat != null && p.lng != null
      ? fmtDist(haversineKm(userLocation.lat, userLocation.lng, p.lat, p.lng))
      : "—";

  const deadlineStr = (p: DisplayProperty) => {
    const d = deadlines[p.id];
    return d != null
      ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      : "—";
  };

  const rows: { label: string; render: (p: DisplayProperty) => string }[] = [
    { label: t("property.deadline"), render: deadlineStr },
    { label: "AMI %", render: amiPct },
    { label: "Bedrooms", render: p => {
        const b = p.bedrooms;
        const parts: string[] = [];
        if (b.studio > 0) parts.push("Studio");
        if (b.br1 > 0) parts.push("1BR");
        if (b.br2 > 0) parts.push("2BR");
        if (b.br3 > 0) parts.push("3BR");
        if (b.br4plus > 0) parts.push("4+BR");
        return parts.length ? parts.join(", ") : "—";
      } },
    { label: "Affordable units", render: p => (p.affordableUnits > 0 ? String(p.affordableUnits) : "—") },
    { label: "Total units", render: p => (p.totalUnits > 0 ? String(p.totalUnits) : "—") },
    { label: "Affordability", render: p => getAffordabilityTier(p).label },
    { label: "Status", render: p => {
        const s = appStatuses[p.id];
        return s ? STATUS_LABELS[s] : "—";
      } },
    { label: "Distance", render: dist },
  ];

  return (
    <div className="compare-panel" role="dialog" aria-label={t("compare.title")}>
      <div className="compare-panel-inner">
        <div className="compare-header">
          <span className="compare-title">{t("compare.title")}</span>
          <button className="compare-clear-btn" onClick={onClear} type="button">
            {t("compare.clear")}
          </button>
        </div>
        <div className="compare-grid" style={{ gridTemplateColumns: `120px repeat(${properties.length}, minmax(0, 1fr))` }}>
          {}
          <div className="compare-cell compare-row-label" />
          {properties.map(p => (
            <div key={`h-${p.id}`} className="compare-cell compare-col-head">
              <button className="compare-name-btn" onClick={() => onSelect(p)} type="button" title={p.name}>
                {p.name}
              </button>
              <button
                className="compare-remove-btn"
                onClick={() => onRemove(p.id)}
                type="button"
                aria-label={`Remove ${p.name} from comparison`}
              >
                ×
              </button>
            </div>
          ))}

          {rows.map(row => (
            <div key={row.label} className="compare-contents" style={{ display: "contents" }}>
              <div className="compare-cell compare-row-label">{row.label}</div>
              {properties.map(p => (
                <div key={`${row.label}-${p.id}`} className="compare-cell compare-value">
                  {row.render(p)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
