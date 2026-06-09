import { lazy, Suspense } from "react";
import type { DisplayProperty, HousingCollection } from "../types/housing";
import type { UserLocation } from "../App";
import { getAffordabilityTier } from "./PropertyCard";
import { haversineKm, fmtDist } from "../lib/geo";

const SimpleMap = lazy(() => import("./SimpleMap").then(m => ({ default: m.SimpleMap })));

interface DetailPanelProps {
  property: DisplayProperty;
  userLocation: UserLocation | null;
  saved: boolean;
  onClose: () => void;
  onSave: (id: string) => void;
}

function bedroomSummary(p: DisplayProperty): string {
  const b = p.bedrooms;
  const parts: string[] = [];
  if (b.studio > 0) parts.push("Studio");
  if (b.br1 > 0) parts.push("1 bed");
  if (b.br2 > 0) parts.push("2 bed");
  if (b.br3 > 0) parts.push("3 bed");
  if (b.br4plus > 0) parts.push("4+ bed");
  return parts.length ? parts.join(", ") : "Ask property for details";
}

function popLabel(p: DisplayProperty): string {
  const t = p.populationTypes;
  if (!t.length) return "";
  if (t.includes("Elderly")) return "Senior (62+)";
  if (t.includes("Disabled")) return "Accessibility-friendly";
  if (t.includes("Family")) return "Family housing";
  return t[0];
}

export function DetailPanel({ property: p, userLocation, saved, onClose, onSave }: DetailPanelProps) {
  const tier = getAffordabilityTier(p);
  const dist = userLocation && p.lat != null && p.lng != null
    ? fmtDist(haversineKm(userLocation.lat, userLocation.lng, p.lat, p.lng))
    : null;

  const miniMapData: HousingCollection | null = p.lat != null && p.lng != null ? {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      id: p.id,
      geometry: { type: "Point", coordinates: [p.lng!, p.lat!] },
      properties: { ...p.raw, _displayId: p.id },
    }],
  } : null;

  const applyUrl = p.website
    || `https://affordablehousingonline.com/search?name=${encodeURIComponent(p.name)}&city=${encodeURIComponent(p.city)}&state=${encodeURIComponent(p.state)}`;

  return (
    <aside className="detail-panel" aria-label={`Details for ${p.name}`}>
      <div className="detail-header">
        <button className="detail-close-btn" onClick={onClose} aria-label="Close details" type="button">
          ×
        </button>
        <button
          className={`detail-save-btn${saved ? " saved" : ""}`}
          onClick={() => onSave(p.id)}
          aria-pressed={saved}
          type="button"
        >
          {saved ? "Saved" : "Save Home"}
        </button>
      </div>

      {/* Mini map */}
      {miniMapData && p.lat != null && p.lng != null && (
        <div className="detail-map-wrap">
          <Suspense fallback={<div className="detail-map-placeholder" />}>
            <SimpleMap
              lat={p.lat}
              lng={p.lng}
              data={miniMapData}
              selectedId={p.id}
            />
          </Suspense>
        </div>
      )}

      <div className="detail-body">
        {/* Address */}
        <h2 className="detail-address">
          {p.address}, {p.city}, {p.state} {p.zip}
        </h2>
        {dist && <p className="detail-dist">{dist} from your location</p>}

        {/* Tier */}
        <div className={`detail-tier-card ${tier.colorClass}`}>
          <div className="detail-tier-label">{tier.label}</div>
          <div className="detail-afford-bar-wrap" aria-label={`Affordability level: ${tier.barPct}%`}>
            <div className={`detail-afford-bar-fill ${tier.colorClass}`} style={{ width: `${tier.barPct}%` }} />
          </div>
          <p className="detail-tier-sub">{tier.sublabel}</p>
        </div>

        {/* Quick facts */}
        <div className="detail-facts">
          {bedroomSummary(p) && (
            <div className="detail-fact-row">
              <span className="detail-fact-label">Bedrooms</span>
              <span className="detail-fact-value">{bedroomSummary(p)}</span>
            </div>
          )}
          {popLabel(p) && (
            <div className="detail-fact-row">
              <span className="detail-fact-label">Best for</span>
              <span className="detail-fact-value">{popLabel(p)}</span>
            </div>
          )}
          {p.phone && (
            <div className="detail-fact-row">
              <span className="detail-fact-label">Phone</span>
              <a className="detail-fact-link" href={`tel:${p.phone}`}>{p.phone}</a>
            </div>
          )}
          {p.hasRentalAssistance && (
            <div className="detail-fact-row">
              <span className="detail-fact-label">Assistance</span>
              <span className="detail-fact-value detail-badge-assist">Rental assistance available</span>
            </div>
          )}
        </div>

        {/* Primary CTA */}
        <a
          className="detail-apply-btn"
          href={applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Apply or get more information"
        >
          Apply Now / Get Info
        </a>

        {/* Secondary links */}
        <div className="detail-secondary-links">
          {p.lat != null && p.lng != null && (
            <>
              <a
                className="detail-link-pill"
                href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
                target="_blank" rel="noopener noreferrer"
              >
                Get Directions
              </a>
              <a
                className="detail-link-pill"
                href={`https://www.google.com/maps/search/transit/@${p.lat},${p.lng},15z`}
                target="_blank" rel="noopener noreferrer"
              >
                Nearby Transit
              </a>
            </>
          )}
          <a
            className="detail-link-pill"
            href={`https://affordablehousingonline.com/search?name=${encodeURIComponent(p.name)}&city=${encodeURIComponent(p.city)}&state=${encodeURIComponent(p.state)}`}
            target="_blank" rel="noopener noreferrer"
          >
            Check Waitlist
          </a>
        </div>
      </div>
    </aside>
  );
}
