import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import type { DisplayProperty } from "../types/housing";
import type { UserLocation, AppStatusValue } from "../App";
import { haversineKm, fmtDist } from "../lib/geo";

// ── Affordability tier from property data ─────────────────────────────────────

export interface AffordabilityTier {
  label: string;
  sublabel: string;
  barPct: number;
  colorClass: string;
}

export function getAffordabilityTier(p: DisplayProperty): AffordabilityTier {
  const pct = p.incomeCeilingPct;

  if (p.source === "sj") {
    const hasEli = (p.eliunits ?? 0) > 0;
    const hasVli = (p.vliunits ?? 0) > 0;
    const hasLi  = (p.liunits ?? 0) > 0;
    if (hasEli) return { label: "Very Affordable", sublabel: "For very low incomes", barPct: 90, colorClass: "tier-very" };
    if (hasVli) return { label: "Affordable",      sublabel: "For low incomes",      barPct: 75, colorClass: "tier-aff" };
    if (hasLi)  return { label: "Good Fit",         sublabel: "For moderate incomes", barPct: 55, colorClass: "tier-good" };
    return       { label: "Income Assisted",         sublabel: "Income limits apply", barPct: 40, colorClass: "tier-mod" };
  }

  if (pct !== undefined) {
    if (pct <= 30) return { label: "Very Affordable", sublabel: "For very low incomes", barPct: 92, colorClass: "tier-very" };
    if (pct <= 50) return { label: "Affordable",      sublabel: "For low incomes",      barPct: 78, colorClass: "tier-aff" };
    if (pct <= 60) return { label: "Affordable",      sublabel: "For low incomes",      barPct: 72, colorClass: "tier-aff" };
    if (pct <= 80) return { label: "Good Fit",         sublabel: "For moderate incomes", barPct: 55, colorClass: "tier-good" };
    return          { label: "Moderately Assisted",   sublabel: "Higher income limit",  barPct: 38, colorClass: "tier-mod" };
  }
  return { label: "Income Assisted", sublabel: "Income limits apply", barPct: 45, colorClass: "tier-mod" };
}

// ── OSM Tile hero image ────────────────────────────────────────────────────────

function latLngToTile(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  const x = (lng + 180) / 360 * n;
  const latRad = lat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
  return { x, y, tx: Math.floor(x), ty: Math.floor(y) };
}

const ESRI_SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";

function PropertyHero({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  const ZOOM = 19;
  const TILE = 256;

  const { x, y, tx, ty } = latLngToTile(lat, lng, ZOOM);
  const tiles = [
    { tx: tx - 1, ty: ty - 1 }, { tx, ty: ty - 1 }, { tx: tx + 1, ty: ty - 1 },
    { tx: tx - 1, ty },         { tx, ty },          { tx: tx + 1, ty },
  ];
  const RAW_W = 3 * TILE;
  const DISPLAY_H = 180;
  const SCALE = 310 / RAW_W;
  const SCALED_H = 2 * TILE * SCALE;
  const propY = (y - (ty - 1)) * TILE * SCALE;
  const vOffset = Math.max(0, Math.min(propY - DISPLAY_H / 2, SCALED_H - DISPLAY_H));

  return (
    <div className="prop-hero-map" aria-label={`Aerial view near ${name}`}>
      <div
        className="prop-hero-tiles"
        style={{
          transform: `scale(${SCALE}) translateY(${-vOffset / SCALE}px)`,
          transformOrigin: "top left",
          width: RAW_W,
        }}
      >
        {tiles.map(({ tx: ttx, ty: tty }) => (
          <img
            key={`${ttx}-${tty}`}
            src={`${ESRI_SAT}/${ZOOM}/${tty}/${ttx}`}
            width={TILE} height={TILE}
            alt="" aria-hidden="true" loading="lazy"
          />
        ))}
      </div>
      <div
        className="prop-hero-pin"
        style={{
          left: (x - (tx - 1)) * TILE * SCALE,
          top: propY - vOffset,
        }}
        aria-hidden="true"
      />
    </div>
  );
}

function GradientHero({ name }: { name: string }) {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const hues = [210, 220, 230, 200, 190, 240];
  const h = hues[hash % hues.length];
  return (
    <div
      className="prop-hero-gradient"
      style={{ background: `linear-gradient(135deg, oklch(20% 0.06 ${h}), oklch(16% 0.03 ${h + 25}))` }}
      aria-hidden="true"
    >
      <svg width="48" height="44" viewBox="0 0 40 36" fill="none" aria-hidden="true">
        <path d="M20 3L2 16h4v17h10V22h8v11h10V16h4L20 3z"
          stroke="oklch(40% 0.08 220)" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function plainAddress(p: DisplayProperty): string {
  const parts = [p.address, p.city, p.state].filter(Boolean);
  if (p.zip) parts.push(p.zip);
  return parts.join(", ");
}

// ── Card ─────────────────────────────────────────────────────────────────────

interface PropertyCardProps {
  property: DisplayProperty;
  userLocation: UserLocation | null;
  saved: boolean;
  appStatus?: AppStatusValue;
  onSelect: (p: DisplayProperty) => void;
  onSave: (id: string) => void;
  onStatusChange?: (id: string, status: AppStatusValue | null) => void;
}

const STATUS_LABELS: Record<AppStatusValue, string> = {
  interested: "Interested",
  applied: "Applied",
  waitlisted: "Waitlisted",
};

const STATUS_COLORS: Record<AppStatusValue, string> = {
  interested: "#3b82f6",
  applied: "#10b981",
  waitlisted: "#f59e0b",
};

export function PropertyCard({ property: p, userLocation, saved, appStatus, onSelect, onSave, onStatusChange }: PropertyCardProps) {
  const { t } = useTranslation();
  const tier = getAffordabilityTier(p);
  const dist = userLocation && p.lat != null && p.lng != null
    ? fmtDist(haversineKm(userLocation.lat, userLocation.lng, p.lat, p.lng))
    : null;

  const hasWebsite = !!p.website;
  const applyUrl = p.website
    || `https://www.google.com/search?q=${encodeURIComponent(`"${p.name}" ${p.city} ${p.state} affordable housing apply`)}`;

  const handleApply = (e: React.MouseEvent) => {
    e.stopPropagation();
    openUrl(applyUrl).catch(() => window.open(applyUrl, "_blank", "noopener,noreferrer"));
  };

  return (
    <article className="prop-card" onClick={() => onSelect(p)} tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(p); } }}
      aria-label={`${p.name}, ${p.city}, ${p.state}`}
    >
      {/* Hero image */}
      <div className="prop-card-hero">
        {p.lat != null && p.lng != null
          ? <PropertyHero lat={p.lat} lng={p.lng} name={p.name} />
          : <GradientHero name={p.name} />
        }
        <div className={`prop-tier-badge ${tier.colorClass}`}>{tier.label}</div>
        {p.incomeCeilingPct != null && (
          <div className="prop-ami-badge">≤{p.incomeCeilingPct}% AMI</div>
        )}
        {dist && <div className="prop-dist-badge">{dist} away</div>}
        {p.isLikelyExpired && (
          <div className="prop-expired-badge" title={t("property.expiredWarning")}>
            ⚠ {t("property.expiredWarning")}
          </div>
        )}
        <button
          className={`prop-save-icon${saved ? " saved" : ""}`}
          onClick={e => { e.stopPropagation(); onSave(p.id); }}
          aria-label={saved ? t("ui.saved") : t("ui.saveHome")}
          aria-pressed={saved}
          type="button"
        >
          {saved ? "♥" : "♡"}
        </button>
      </div>

      {/* Card body */}
      <div className="prop-card-body">
        <div className="prop-card-name">{p.name}</div>
        <div className="prop-card-address">{plainAddress(p)}</div>
        {p.source === "public" && (
          <div className="prop-source-badge">Public Housing</div>
        )}
        {p.source === "public" && p.waitlistStatus === "open" && (
          <div className="prop-waitlist-badge prop-waitlist-open">{t("property.waitlistOpen")}</div>
        )}
        {p.source === "public" && p.waitlistStatus === "closed" && (
          <div className="prop-waitlist-badge prop-waitlist-closed">{t("property.waitlistClosed")}</div>
        )}
        {p.phone && (
          <a
            className="prop-phone"
            href={`tel:${p.phone.replace(/[^0-9+]/g, "")}`}
            onClick={e => e.stopPropagation()}
            aria-label={`Call ${p.name}: ${p.phone}`}
          >
            {p.phone}
          </a>
        )}

        {/* Affordability bar */}
        <div className="prop-afford-row">
          <div className="prop-afford-bar-wrap" aria-label={`Affordability: ${tier.label}`}>
            <div className={`prop-afford-bar-fill ${tier.colorClass}`} style={{ width: `${tier.barPct}%` }} />
          </div>
          <span className="prop-afford-sublabel">{tier.sublabel}</span>
        </div>

        {/* Apply Now note for properties without a website */}
        {!hasWebsite && (
          <p className="prop-no-website-note">{t("ui.noWebsiteNote")}</p>
        )}

        {/* CTAs */}
        {onStatusChange && (
          <div className="prop-status-row" onClick={e => e.stopPropagation()}>
            {(["interested", "applied", "waitlisted"] as AppStatusValue[]).map(s => (
              <button
                key={s}
                className={`prop-status-btn${appStatus === s ? " active" : ""}`}
                style={appStatus === s ? { borderColor: STATUS_COLORS[s], color: STATUS_COLORS[s] } : undefined}
                onClick={() => onStatusChange(p.id, appStatus === s ? null : s)}
                type="button"
                aria-pressed={appStatus === s}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        )}
        <div className="prop-card-actions">
          <button
            className="prop-cta-apply"
            onClick={handleApply}
            aria-label={`${hasWebsite ? t("ui.applyNow") : t("ui.searchOnline")} for ${p.name}`}
            type="button"
          >
            {hasWebsite ? t("ui.applyNow") : t("ui.searchOnline")}
          </button>
          <button
            className="prop-cta-info"
            onClick={e => { e.stopPropagation(); onSelect(p); }}
            aria-label={`${t("ui.requestInfo")} for ${p.name}`}
            type="button"
          >
            {t("ui.requestInfo")}
          </button>
        </div>
      </div>
    </article>
  );
}
