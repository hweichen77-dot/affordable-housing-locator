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
  userIncome?: number;
  userHhSize?: number;
  saved: boolean;
  onClose: () => void;
  onSave: (id: string) => void;
}

function bedroomRows(p: DisplayProperty) {
  const b = p.bedrooms;
  const rows: { label: string; units: number }[] = [];
  if (b.studio > 0)  rows.push({ label: "Studio",      units: b.studio });
  if (b.br1 > 0)     rows.push({ label: "1 Bedroom",   units: b.br1 });
  if (b.br2 > 0)     rows.push({ label: "2 Bedrooms",  units: b.br2 });
  if (b.br3 > 0)     rows.push({ label: "3 Bedrooms",  units: b.br3 });
  if (b.br4plus > 0) rows.push({ label: "4+ Bedrooms", units: b.br4plus });
  return rows;
}

function popLabel(p: DisplayProperty): string {
  const t = p.populationTypes;
  if (!t.length) return "";
  if (t.includes("Elderly"))  return "Senior housing (62+)";
  if (t.includes("Disabled")) return "Disability-accessible housing";
  if (t.includes("Family"))   return "Family housing";
  if (t.includes("Homeless")) return "Transitional/supportive housing";
  return t.join(", ");
}

function amiTierName(pct: number): string {
  if (pct <= 30)  return "Extremely Low Income (ELI)";
  if (pct <= 50)  return "Very Low Income (VLI)";
  if (pct <= 60)  return "Low Income – 60% AMI (LIHTC standard)";
  if (pct <= 80)  return "Low Income (LI)";
  if (pct <= 120) return "Moderate Income";
  return "Market Rate";
}

async function openExternal(url: string) {
  try { await openUrl(url); }
  catch { window.open(url, "_blank", "noopener,noreferrer"); }
}

const AMI_TIER_GUIDE = [
  { pct: 30,  label: "≤30% AMI", name: "Extremely Low Income",      programs: "Emergency vouchers, public housing, HUD VASH" },
  { pct: 50,  label: "≤50% AMI", name: "Very Low Income",           programs: "Section 8, Housing Choice Vouchers, most HUD programs" },
  { pct: 60,  label: "≤60% AMI", name: "Low Income (LIHTC standard)", programs: "Most LIHTC affordable apartments — the most common type" },
  { pct: 80,  label: "≤80% AMI", name: "Low Income",                programs: "Workforce housing, HOME program, city/county programs" },
  { pct: 120, label: "≤120% AMI", name: "Moderate Income",          programs: "Some city/county programs, inclusionary units" },
];

const APPLICATION_DOCS = [
  "Government-issued photo ID (driver's license, passport, or state ID)",
  "Pay stubs from the last 2–3 months, or last 2 years of tax returns if self-employed",
  "Social Security numbers for all household members",
  "Bank statements from the last 2–3 months",
  "Documentation of other income (Social Security, disability, child support, alimony)",
  "Prior landlord references or rental history (last 2 addresses)",
  "Birth certificates for any children in the household",
];

export function DetailPanel({
  property: p,
  userLocation,
  ami,
  userIncome = 0,
  userHhSize = 1,
  saved,
  onClose,
  onSave,
}: DetailPanelProps) {
  const tier = getAffordabilityTier(p);
  const dist = userLocation && p.lat != null && p.lng != null
    ? fmtDist(haversineKm(userLocation.lat, userLocation.lng, p.lat, p.lng))
    : null;

  // Default LIHTC properties to 60% AMI (HUD standard for LIHTC programs)
  const ceilPct = p.incomeCeilingPct
    ?? (p.source === "sj"
      ? ((p.eliunits ?? 0) > 0 ? 30 : (p.vliunits ?? 0) > 0 ? 50 : (p.liunits ?? 0) > 0 ? 80 : 120)
      : p.source === "lihtc" ? 60 : undefined);

  const rentRange = ceilPct !== undefined ? rentRangeForTier(ceilPct, ami) : null;

  // Income qualification check against user's entered income
  const incomeLimit = ceilPct !== undefined
    ? Math.round(adjustedAmi(ami, userHhSize) * ceilPct / 100)
    : null;
  const qualifies = incomeLimit !== null && userIncome > 0
    ? userIncome <= incomeLimit
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

  // Use Google search as fallback — AHO's /search endpoint returns raw JSON, not a page
  const applyUrl = p.website
    || `https://www.google.com/search?q=${encodeURIComponent(`"${p.name}" ${p.city} ${p.state} affordable housing apply`)}`;

  const brRows = bedroomRows(p);
  const pop = popLabel(p);

  const expiryYear = p.source === "sj" && p.arExpiry
    ? new Date(p.arExpiry).getFullYear()
    : p.yearBuilt ? p.yearBuilt + 30 : null;
  const yearsLeft = expiryYear ? expiryYear - new Date().getFullYear() : null;

  return (
    <aside className="detail-panel" aria-label={`Details for ${p.name}`}>
      <div className="detail-header">
        <button className="detail-close-btn" onClick={onClose} aria-label="Close details" type="button">×</button>
        <button
          className={`detail-save-btn${saved ? " saved" : ""}`}
          onClick={() => onSave(p.id)}
          aria-pressed={saved}
          type="button"
        >
          {saved ? "Saved" : "Save Home"}
        </button>
      </div>

      {miniMapData && p.lat != null && p.lng != null && (
        <div className="detail-map-wrap">
          <Suspense fallback={<div className="detail-map-placeholder" />}>
            <SimpleMap lat={p.lat} lng={p.lng} data={miniMapData} />
          </Suspense>
        </div>
      )}

      <div className="detail-body">
        {/* Name + address */}
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
              {amiTierName(ceilPct)} — household income must stay under{" "}
              <strong>{ceilPct}% of the Area Median Income (AMI)</strong>
              {incomeLimit && <> · up to {fmt(incomeLimit)}/yr for {userHhSize}-person household</>}
            </p>
          )}
        </div>

        {/* Qualification banner — only shown when user has entered income */}
        {qualifies !== null && (
          <div className={`detail-qualify-banner ${qualifies ? "qualify-yes" : "qualify-no"}`}>
            <span className="qualify-icon">{qualifies ? "✓" : "✗"}</span>
            <div>
              <div className="qualify-title">
                {qualifies
                  ? "Your income likely qualifies"
                  : "Your income may exceed the limit"}
              </div>
              <div className="qualify-detail">
                Your income: <strong>{fmt(userIncome)}/yr</strong>
                {" · "}
                {userHhSize}-person limit at {ceilPct}% AMI: <strong>{fmt(incomeLimit!)}/yr</strong>
              </div>
              {!qualifies && (
                <div className="qualify-tip">
                  Check if a higher AMI-tier unit is available, or look for moderate-income programs.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Income & rent estimates */}
        {(ceilPct !== undefined || rentRange) && (
          <div className="detail-section">
            <div className="detail-section-title">Income & Rent Estimates</div>

            <div className="detail-ami-explainer">
              <span className="detail-ami-explainer-icon">ℹ</span>
              <span>
                <strong>AMI = Area Median Income</strong> — the midpoint household income for your metro,
                set annually by HUD. To qualify, your household's gross annual income must be below{" "}
                {ceilPct ?? 60}% of the local AMI.
                {userIncome === 0 && " Set your income in the filter bar to see if you qualify."}
              </span>
            </div>

            <div className="detail-facts">
              {ceilPct !== undefined && (
                <>
                  <div className="detail-fact-row detail-fact-header">
                    <span className="detail-fact-label">Household size</span>
                    <span className="detail-fact-value">Max income to qualify ({ceilPct}% AMI)</span>
                  </div>
                  {[1, 2, 3, 4, 5, 6].map(sz => {
                    const limit = Math.round(adjustedAmi(ami, sz) * ceilPct / 100);
                    const isYou = sz === userHhSize && userIncome > 0;
                    const overLimit = isYou && userIncome > limit;
                    return (
                      <div
                        key={sz}
                        className={`detail-fact-row${isYou ? " detail-row-highlight" : ""}`}
                      >
                        <span className="detail-fact-label">
                          {sz} person{sz > 1 ? "s" : ""}
                          {isYou ? <span className="detail-you-tag"> ← you</span> : null}
                        </span>
                        <span className={`detail-fact-value detail-income-val${overLimit ? " detail-warn" : isYou ? " detail-ok" : ""}`}>
                          {fmt(limit)}/yr
                        </span>
                      </div>
                    );
                  })}
                </>
              )}

              {rentRange && (
                <>
                  <div className="detail-fact-row detail-fact-section-break">
                    <span className="detail-rent-header">HUD maximum rents at {ceilPct}% AMI</span>
                    <span className="detail-fact-value" style={{ fontSize: "10px", color: "var(--text-muted)" }}>estimate</span>
                  </div>
                  {[
                    { label: "Studio",     val: rentRange.studio },
                    { label: "1 Bedroom",  val: rentRange.oneBed },
                    { label: "2 Bedrooms", val: rentRange.twoBed },
                    { label: "3 Bedrooms", val: rentRange.threeBed },
                  ].map(({ label, val }) => (
                    <div className="detail-fact-row" key={label}>
                      <span className="detail-fact-label">{label}</span>
                      <span className="detail-fact-value">{fmt(val)}/mo</span>
                    </div>
                  ))}
                  <div className="detail-rent-note">
                    Rents are HUD formula maximums — actual rents are set by the property at or below these amounts.
                    Utilities may be billed separately.
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* AMI tier guide */}
        {ceilPct !== undefined && (
          <div className="detail-section">
            <div className="detail-section-title">What AMI % means for you</div>
            <div className="detail-ami-tiers">
              {AMI_TIER_GUIDE.map(t => {
                const isThis = t.pct === ceilPct;
                const isAbove = t.pct > ceilPct;
                return (
                  <div
                    key={t.pct}
                    className={`detail-ami-tier-row${isThis ? " detail-ami-tier-active" : isAbove ? " detail-ami-tier-above" : ""}`}
                  >
                    <div className="detail-ami-tier-pct">{t.label}</div>
                    <div className="detail-ami-tier-info">
                      <span className="detail-ami-tier-name">{t.name}</span>
                      <span className="detail-ami-tier-programs">{t.programs}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="detail-ami-guide-note">
              ↑ This property requires income at or below the highlighted tier.
              Lower % = more subsidy and fewer competing applicants.
            </p>
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
            {p.propertyManager && (
              <div className="detail-fact-row">
                <span className="detail-fact-label">Property manager</span>
                <span className="detail-fact-value">{p.propertyManager}</span>
              </div>
            )}
            {p.developer && p.developer !== p.propertyManager && (
              <div className="detail-fact-row">
                <span className="detail-fact-label">Developer</span>
                <span className="detail-fact-value">{p.developer}</span>
              </div>
            )}
            {p.phone && (
              <div className="detail-fact-row">
                <span className="detail-fact-label">Phone</span>
                <button className="detail-fact-link" onClick={() => openExternal(`tel:${p.phone}`)} type="button">
                  {p.phone}
                </button>
              </div>
            )}
            <div className="detail-fact-row">
              <span className="detail-fact-label">Data source</span>
              <span className="detail-fact-value detail-source-note">
                {p.source === "sj" ? "City of San Jose" : "HUD LIHTC Database"}
                <span className="detail-source-sub"> · verify details directly with property</span>
              </span>
            </div>
          </div>
        </div>

        {/* Application guide */}
        <div className="detail-section">
          <div className="detail-section-title">How to Apply</div>
          <p className="detail-apply-intro">
            {p.source === "lihtc"
              ? "LIHTC properties often have waitlists. Apply as early as possible — units open when tenants move out. Waitlists can be months to years long."
              : "Contact the property directly to ask about open units and application status."}
          </p>
          <div className="detail-checklist">
            <div className="detail-checklist-label">Documents you'll likely need</div>
            {APPLICATION_DOCS.map(doc => (
              <div className="detail-checklist-item" key={doc}>
                <span className="detail-check-icon">□</span>
                <span>{doc}</span>
              </div>
            ))}
          </div>
          <p className="detail-apply-tip">
            Tip: Apply to multiple properties simultaneously. Income must be re-verified annually —
            if your income rises above the limit, you typically can stay but won't be eligible on renewal
            at some properties.
          </p>
        </div>

        {/* Primary CTA */}
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
            onClick={() => openExternal(`https://www.google.com/search?q=${encodeURIComponent(`${p.name} ${p.city} ${p.state} affordable housing waitlist apply`)}`)}
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
