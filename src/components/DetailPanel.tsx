import { lazy, Suspense } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { DisplayProperty, HousingCollection } from "../types/housing";
import type { UserLocation } from "../App";
import { getAffordabilityTier } from "./PropertyCard";
import { haversineKm, fmtDist } from "../lib/geo";
import { rentRangeForTier, fmt, adjustedAmi } from "../lib/ami";

const SimpleMap = lazy(() => import("./SimpleMap").then(m => ({ default: m.SimpleMap })));

interface DetailPanelProps {
  property: DisplayProperty;
  userLocation: UserLocation | null;
  ami: number;
  saved: boolean;
  onClose: () => void;
  onSave: (id: string) => void;
}

function bedroomRows(p: DisplayProperty) {
  const b = p.bedrooms;
  const rows: { label: string; units: number }[] = [];
  if (b.studio > 0) rows.push({ label: "Studio", units: b.studio });
  if (b.br1 > 0)    rows.push({ label: "1 Bedroom", units: b.br1 });
  if (b.br2 > 0)    rows.push({ label: "2 Bedrooms", units: b.br2 });
  if (b.br3 > 0)    rows.push({ label: "3 Bedrooms", units: b.br3 });
  if (b.br4plus > 0) rows.push({ label: "4+ Bedrooms", units: b.br4plus });
  return rows;
}

function popLabel(p: DisplayProperty): string {
  const t = p.populationTypes;
  if (!t.length) return "";
  if (t.includes("Elderly")) return "Senior housing (62+)";
  if (t.includes("Disabled")) return "Disability-accessible housing";
  if (t.includes("Family")) return "Family housing";
  if (t.includes("Homeless")) return "Transitional/supportive housing";
  return t.join(", ");
}

function amiTierName(pct: number): string {
  if (pct <= 30) return "Extremely Low Income (ELI)";
  if (pct <= 50) return "Very Low Income (VLI)";
  if (pct <= 60) return "Low Income – 60% AMI";
  if (pct <= 80) return "Low Income (LI)";
  if (pct <= 120) return "Moderate Income";
  return "Market Rate";
}

async function openExternal(url: string) {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function DetailPanel({ property: p, userLocation, ami, saved, onClose, onSave }: DetailPanelProps) {
  const tier = getAffordabilityTier(p);
  const dist = userLocation && p.lat != null && p.lng != null
    ? fmtDist(haversineKm(userLocation.lat, userLocation.lng, p.lat, p.lng))
    : null;

  // Determine income ceiling pct for rent/income calculations
  const ceilPct = p.incomeCeilingPct
    ?? (p.source === "sj"
      ? ((p.eliunits ?? 0) > 0 ? 30 : (p.vliunits ?? 0) > 0 ? 50 : (p.liunits ?? 0) > 0 ? 80 : 120)
      : undefined);

  const rentRange = ceilPct !== undefined ? rentRangeForTier(ceilPct, ami) : null;

  const miniMapData: HousingCollection | null = p.lat != null && p.lng != null ? {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      id: p.id,
      geometry: { type: "Point", coordinates: [p.lng!, p.lat!] },
      properties: { ...p.raw, _displayId: p.id },
    }],
  } : null;

  // Best apply URL: property website, then wait list checker
  const applyUrl = p.website
    || `https://affordablehousingonline.com/search?name=${encodeURIComponent(p.name)}&city=${encodeURIComponent(p.city)}&state=${encodeURIComponent(p.state)}`;

  const brRows = bedroomRows(p);
  const pop = popLabel(p);

  // Expiry
  const expiryYear = p.source === "sj" && p.arExpiry
    ? new Date(p.arExpiry).getFullYear()
    : p.yearBuilt ? p.yearBuilt + 30 : null;
  const yearsLeft = expiryYear ? expiryYear - new Date().getFullYear() : null;

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
            <SimpleMap lat={p.lat} lng={p.lng} data={miniMapData} />
          </Suspense>
        </div>
      )}

      <div className="detail-body">
        {/* Address + name */}
        <div>
          <h2 className="detail-prop-name">{p.name}</h2>
          <p className="detail-address">{p.address}, {p.city}, {p.state} {p.zip}</p>
          {dist && <p className="detail-dist">{dist} from your location</p>}
        </div>

        {/* Affordability tier card */}
        <div className={`detail-tier-card ${tier.colorClass}`}>
          <div className="detail-tier-label">{tier.label}</div>
          <div className="detail-afford-bar-wrap" aria-label={`Affordability level: ${tier.barPct}%`}>
            <div className={`detail-afford-bar-fill ${tier.colorClass}`} style={{ width: `${tier.barPct}%` }} />
          </div>
          <p className="detail-tier-sub">{tier.sublabel}</p>
          {ceilPct !== undefined && (
            <p className="detail-tier-ami">
              {amiTierName(ceilPct)} — income must be under {ceilPct}% of the area median income (AMI)
            </p>
          )}
        </div>

        {/* Income & rent info */}
        {(ceilPct !== undefined || rentRange) && (
          <div className="detail-section">
            <div className="detail-section-title">Income & Rent Estimates</div>
            <div className="detail-facts">
              {ceilPct !== undefined && (
                <>
                  <div className="detail-fact-row">
                    <span className="detail-fact-label">AMI limit</span>
                    <span className="detail-fact-value">{ceilPct}% of area median</span>
                  </div>
                  {[1, 2, 3, 4].map(sz => (
                    <div className="detail-fact-row" key={sz}>
                      <span className="detail-fact-label">Max income ({sz}-person household)</span>
                      <span className="detail-fact-value detail-income-val">{fmt(Math.round(adjustedAmi(ami, sz) * ceilPct / 100))}/yr</span>
                    </div>
                  ))}
                </>
              )}
              {rentRange && (
                <>
                  <div className="detail-fact-row">
                    <span className="detail-fact-label">Estimated rent — Studio</span>
                    <span className="detail-fact-value">{fmt(rentRange.studio)}/mo</span>
                  </div>
                  <div className="detail-fact-row">
                    <span className="detail-fact-label">Estimated rent — 1 Bed</span>
                    <span className="detail-fact-value">{fmt(rentRange.oneBed)}/mo</span>
                  </div>
                  <div className="detail-fact-row">
                    <span className="detail-fact-label">Estimated rent — 2 Bed</span>
                    <span className="detail-fact-value">{fmt(rentRange.twoBed)}/mo</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Unit details */}
        {(brRows.length > 0 || p.affordableUnits > 0 || p.totalUnits > 0) && (
          <div className="detail-section">
            <div className="detail-section-title">Unit Details</div>
            <div className="detail-facts">
              {p.affordableUnits > 0 && (
                <div className="detail-fact-row">
                  <span className="detail-fact-label">Income-restricted units</span>
                  <span className="detail-fact-value">{p.affordableUnits}</span>
                </div>
              )}
              {p.totalUnits > 0 && (
                <div className="detail-fact-row">
                  <span className="detail-fact-label">Total units in building</span>
                  <span className="detail-fact-value">{p.totalUnits}</span>
                </div>
              )}
              {brRows.map(({ label, units }) => (
                <div className="detail-fact-row" key={label}>
                  <span className="detail-fact-label">{label}</span>
                  <span className="detail-fact-value">{units} units</span>
                </div>
              ))}
              {pop && (
                <div className="detail-fact-row">
                  <span className="detail-fact-label">Housing type</span>
                  <span className="detail-fact-value">{pop}</span>
                </div>
              )}
              {p.hasRentalAssistance && (
                <div className="detail-fact-row">
                  <span className="detail-fact-label">Assistance</span>
                  <span className="detail-fact-value detail-badge-assist">Rental assistance available</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Property info */}
        <div className="detail-section">
          <div className="detail-section-title">Property Information</div>
          <div className="detail-facts">
            {p.yearBuilt && (
              <div className="detail-fact-row">
                <span className="detail-fact-label">Year built</span>
                <span className="detail-fact-value">{p.yearBuilt}</span>
              </div>
            )}
            {expiryYear && (
              <div className="detail-fact-row">
                <span className="detail-fact-label">Affordability expires</span>
                <span className={`detail-fact-value${yearsLeft !== null && yearsLeft < 5 ? " detail-warn" : ""}`}>
                  {expiryYear} {yearsLeft !== null ? `(${yearsLeft > 0 ? yearsLeft + " yrs left" : "expired"})` : ""}
                </span>
              </div>
            )}
            {p.developer && (
              <div className="detail-fact-row">
                <span className="detail-fact-label">Developer</span>
                <span className="detail-fact-value">{p.developer}</span>
              </div>
            )}
            {p.phone && (
              <div className="detail-fact-row">
                <span className="detail-fact-label">Phone</span>
                <button className="detail-fact-link" onClick={() => openExternal(`tel:${p.phone}`)} type="button">{p.phone}</button>
              </div>
            )}
            <div className="detail-fact-row">
              <span className="detail-fact-label">Data source</span>
              <span className="detail-fact-value">{p.source === "sj" ? "City of San Jose" : "HUD LIHTC Database"}</span>
            </div>
          </div>
        </div>

        {/* Primary CTA — uses Tauri opener */}
        <button
          className="detail-apply-btn"
          onClick={() => openExternal(applyUrl)}
          type="button"
          aria-label="Apply or get more information"
        >
          Apply Now / Get Info
        </button>

        {/* Secondary links */}
        <div className="detail-secondary-links">
          {p.lat != null && p.lng != null && (
            <>
              <button
                className="detail-link-pill"
                onClick={() => openExternal(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`)}
                type="button"
              >
                Get Directions
              </button>
              <button
                className="detail-link-pill"
                onClick={() => openExternal(`https://www.google.com/maps/search/transit/@${p.lat},${p.lng},15z`)}
                type="button"
              >
                Nearby Transit
              </button>
            </>
          )}
          <button
            className="detail-link-pill"
            onClick={() => openExternal(`https://affordablehousingonline.com/search?name=${encodeURIComponent(p.name)}&city=${encodeURIComponent(p.city)}&state=${encodeURIComponent(p.state)}`)}
            type="button"
          >
            Check Waitlist
          </button>
          {p.website && (
            <button
              className="detail-link-pill"
              onClick={() => openExternal(p.website!)}
              type="button"
            >
              Official Website
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
