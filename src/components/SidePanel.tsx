import { useRef, useState, useCallback } from "react";
import type { DisplayProperty, DataSource } from "../types/housing";
import type { FilterState, UserLocation } from "../App";
import { DEFAULT_FILTERS } from "../App";
import { rentRangeForTier, fmt } from "../lib/ami";
import { haversineKm, fmtDist } from "../lib/geo";

interface SidePanelProps {
  properties: DisplayProperty[];
  totalCount: number;
  selected: DisplayProperty | null;
  loading: boolean;
  error: string | null;
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
  userLocation: UserLocation | null;
  onSelect: (p: DisplayProperty) => void;
  onClear: () => void;
  onRetry: () => void;
  onSearch: (query: string) => void;
  onWidenSearch?: () => void;
  onGoHome?: () => void;
  onExportFavorites: () => void;
  dataSource: DataSource;
  ami: number;
  searchDisplay?: string;
}

const POP_TYPES = [
  { value: "", label: "All households" },
  { value: "Family", label: "Family" },
  { value: "Elderly", label: "Seniors / Elderly" },
  { value: "Disabled", label: "Disabled / Special Needs" },
  { value: "Homeless", label: "Experiencing Homelessness" },
];

const INCOME_TIERS = [
  { value: "" as const,        label: "Any income level" },
  { value: "ELI" as const,     label: "Ext. Low Income (≤30% AMI)" },
  { value: "VLI" as const,     label: "Very Low Income (≤50% AMI)" },
  { value: "LI" as const,      label: "Low Income (≤80% AMI)" },
  { value: "Moderate" as const, label: "Moderate (≤120% AMI)" },
];

const BEDROOM_SIZES = [
  { value: "" as const,  label: "Any size" },
  { value: "0" as const, label: "Studio" },
  { value: "1" as const, label: "1 bedroom" },
  { value: "2" as const, label: "2 bedrooms" },
  { value: "3" as const, label: "3 bedrooms" },
  { value: "4" as const, label: "4+ bedrooms" },
];

function statusBadge(p: DisplayProperty): { text: string; cls: string } {
  if (p.source === "lihtc") {
    const yr = p.yearBuilt;
    return yr ? { text: `Built ${yr}`, cls: "badge-gray" } : { text: "LIHTC", cls: "badge-blue" };
  }
  if (p.arstatus === "Active") return { text: "Active", cls: "badge-green" };
  return { text: p.arstatus ?? "Unknown", cls: "badge-gray" };
}

function isFiltered(f: FilterState, source: DataSource, nameFilter: string): boolean {
  return (
    (source === "sj" && !f.activeOnly) ||
    f.populationType !== "" ||
    f.incomeTier !== "" ||
    f.bedroomSize !== "" ||
    f.voucherOnly ||
    f.sortBy !== "name" ||
    f.householdIncome > 0 ||
    nameFilter.length > 0
  );
}

export function SidePanel({
  properties, totalCount, selected, loading, error, filters, setFilters,
  favorites, onToggleFavorite, userLocation, onSelect, onClear, onRetry,
  onSearch, onWidenSearch, onGoHome, onExportFavorites, dataSource, ami, searchDisplay,
}: SidePanelProps) {
  const [searchInput, setSearchInput] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [showIncomeCalc, setShowIncomeCalc] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const displayed = showFavsOnly
    ? properties.filter(p => favorites.has(p.id))
    : nameFilter
    ? properties.filter(p =>
        p.name.toLowerCase().includes(nameFilter.toLowerCase()) ||
        p.address.toLowerCase().includes(nameFilter.toLowerCase()) ||
        p.city.toLowerCase().includes(nameFilter.toLowerCase()))
    : properties;

  const favCount = properties.filter(p => favorites.has(p.id)).length;
  const hasActiveFilters = isFiltered(filters, dataSource, nameFilter);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) onSearch(searchInput.trim());
  };

  const clearFilters = useCallback(() => {
    setFilters(f => ({
      ...DEFAULT_FILTERS,
      sortBy: f.sortBy === "distance" ? "distance" : "name",
    }));
    setNameFilter("");
    setShowFavsOnly(false);
    setShowIncomeCalc(false);
  }, [setFilters]);

  return (
    <aside className="side-panel" aria-label="Housing search and filters">
      {/* ── Header ── */}
      <div className="side-panel-header">
        <div className="header-title-row">
          <h1>Housing Locator</h1>
          <div className="header-actions">
            {onGoHome && (
              <button
                className="icon-btn home-btn"
                title="Back to San Jose"
                aria-label="Back to San Jose affordable housing"
                onClick={onGoHome}
              >⌂</button>
            )}
            {favCount > 0 && (
              <button
                className="icon-btn"
                title="Export saved properties"
                aria-label="Export saved properties as text file"
                onClick={onExportFavorites}
              >↓</button>
            )}
            {favCount > 0 && (
              <button
                className={`fav-toggle-btn ${showFavsOnly ? "active" : ""}`}
                onClick={() => setShowFavsOnly(v => !v)}
                aria-pressed={showFavsOnly}
                aria-label={showFavsOnly ? "Showing saved only — click to show all" : `Show ${favCount} saved properties`}
              >♥ {favCount}</button>
            )}
          </div>
        </div>

        {/* City / ZIP search */}
        <form className="city-search-form" onSubmit={handleSearchSubmit} role="search">
          <input
            ref={searchRef}
            className="city-search-input"
            placeholder="City, ZIP, or address…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            aria-label="Search by city, ZIP code, or address"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            className="city-search-btn"
            type="submit"
            disabled={loading}
            aria-label="Search"
          >{loading ? "…" : "→"}</button>
        </form>

        {searchDisplay && (
          <p className="search-location-label" aria-live="polite">
            {searchDisplay.split(",").slice(0, 3).join(",")}
          </p>
        )}
        {dataSource === "lihtc" && (
          <p className="lihtc-info-banner" role="note">
            Showing HUD LIHTC properties — federally funded affordable housing. Income limits vary by property.
          </p>
        )}

        <div className="header-stats" aria-live="polite" aria-atomic="true">
          {!loading && !error && (
            <>
              <span className="stat-pill">{displayed.length} shown</span>
              {totalCount > displayed.length && (
                <span className="stat-pill-dim">of {totalCount}</span>
              )}
              <span className="source-badge">{dataSource === "sj" ? "SJ Local" : "HUD LIHTC"}</span>
            </>
          )}
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="filters-section" aria-label="Filters">
        {/* Row 1: toggle pills + clear */}
        <div className="filter-row filter-row-inline">
          {dataSource === "sj" && (
            <button
              className={`toggle-pill ${filters.activeOnly ? "on" : ""}`}
              onClick={() => setFilters(f => ({ ...f, activeOnly: !f.activeOnly }))}
              aria-pressed={filters.activeOnly}
            >Active only</button>
          )}
          {dataSource !== "sj" && (
            <button
              className={`toggle-pill ${filters.voucherOnly ? "on" : ""}`}
              onClick={() => setFilters(f => ({ ...f, voucherOnly: !f.voucherOnly }))}
              aria-pressed={filters.voucherOnly}
            >Voucher / Sec. 8</button>
          )}
          <button
            className={`toggle-pill ${showIncomeCalc ? "on" : ""}`}
            onClick={() => setShowIncomeCalc(v => !v)}
            aria-pressed={showIncomeCalc}
            aria-expanded={showIncomeCalc}
            title="Filter by your household income. AMI = Area Median Income set annually by HUD."
          >My income</button>
          {hasActiveFilters && (
            <button
              className="clear-filters-btn"
              onClick={clearFilters}
              aria-label="Clear all filters"
            >✕ Clear</button>
          )}
        </div>

        {/* Income calculator */}
        {showIncomeCalc && (
          <div className="income-calc" role="group" aria-label="Income calculator">
            <div className="calc-row">
              <label className="calc-label" htmlFor="income-input">
                Annual income
                <span
                  className="ami-help"
                  title="AMI = Area Median Income. Set annually by HUD per metro area. Used to determine eligibility for affordable housing tiers."
                  aria-label="What is AMI?"
                >?</span>
              </label>
              <div className="calc-input-wrap">
                <span className="calc-prefix" aria-hidden="true">$</span>
                <input
                  id="income-input"
                  type="number"
                  className="calc-input"
                  placeholder="e.g. 45000"
                  value={filters.householdIncome || ""}
                  onChange={e => setFilters(f => ({ ...f, householdIncome: Number(e.target.value) }))}
                  min="0"
                  step="1000"
                  aria-label="Annual household income in dollars"
                />
              </div>
            </div>
            <div className="calc-row">
              <label className="calc-label" htmlFor="household-size">Household size</label>
              <select
                id="household-size"
                className="calc-select"
                value={filters.householdSize}
                onChange={e => setFilters(f => ({ ...f, householdSize: Number(e.target.value) }))}
              >
                {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} person{n > 1 ? "s" : ""}</option>)}
              </select>
            </div>
            {filters.householdIncome > 0 && (
              <QualificationBadges income={filters.householdIncome} persons={filters.householdSize} ami={ami} />
            )}
          </div>
        )}

        {/* Row 2: population + income tier */}
        <div className="filter-row filter-row-inline">
          <select
            className="filter-select"
            value={filters.populationType}
            onChange={e => setFilters(f => ({ ...f, populationType: e.target.value }))}
            aria-label="Filter by population type"
          >
            {POP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select
            className="filter-select"
            value={filters.incomeTier}
            onChange={e => setFilters(f => ({ ...f, incomeTier: e.target.value as FilterState["incomeTier"] }))}
            aria-label="Filter by income tier"
          >
            {INCOME_TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {/* Row 3: bedroom size + name search + sort */}
        <div className="filter-row filter-row-inline">
          <select
            className="filter-select filter-select-sm"
            value={filters.bedroomSize}
            onChange={e => setFilters(f => ({ ...f, bedroomSize: e.target.value as FilterState["bedroomSize"] }))}
            aria-label="Filter by bedroom size"
          >
            {BEDROOM_SIZES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input
            className="search-input"
            type="search"
            placeholder="Filter by name…"
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            aria-label="Filter results by property name or address"
          />
          <select
            className="sort-select"
            value={filters.sortBy}
            onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value as FilterState["sortBy"] }))}
            aria-label="Sort results"
          >
            <option value="name">A–Z</option>
            <option value="units">Most units</option>
            <option value="distance" disabled={!userLocation}>Nearest</option>
          </select>
        </div>
      </div>

      {/* ── Status ── */}
      <div className="side-panel-status" aria-live="polite">
        {loading && <p className="status-text">Searching…</p>}
        {error && (
          <div className="status-error-wrap">
            <p className="status-error" role="alert">{error}</p>
            <button className="retry-btn" onClick={onRetry} aria-label="Retry last search">Retry</button>
          </div>
        )}
        {!loading && !error && (
          <p className="results-count">{displayed.length} result{displayed.length !== 1 ? "s" : ""}</p>
        )}
      </div>

      {/* ── Content ── */}
      {selected ? (
        <DetailView
          property={selected}
          isFav={favorites.has(selected.id)}
          onToggleFav={() => onToggleFavorite(selected.id)}
          onClear={onClear}
          userLocation={userLocation}
          ami={ami}
        />
      ) : (
        <div className="property-list" role="list" aria-label="Housing properties">
          {loading && <SkeletonList />}
          {!loading && !error && displayed.length === 0 && (
            <EmptyState
              showFavsOnly={showFavsOnly}
              hasFilters={hasActiveFilters || nameFilter.length > 0}
              onClearFilters={clearFilters}
              onWidenSearch={onWidenSearch}
            />
          )}
          {!loading && displayed.map(p => {
            const dist = userLocation && p.lat != null && p.lng != null
              ? fmtDist(haversineKm(userLocation.lat, userLocation.lng, p.lat, p.lng))
              : null;
            const isFav = favorites.has(p.id);
            const badge = statusBadge(p);
            return (
              <button
                key={p.id}
                className="property-item"
                onClick={() => onSelect(p)}
                role="listitem"
                aria-label={`${p.name}, ${p.address}${p.city ? `, ${p.city}` : ""}${dist ? `, ${dist}` : ""}`}
              >
                <div className="property-item-top">
                  <span className="property-item-name">{p.name}</span>
                  <button
                    className={`heart-btn ${isFav ? "saved" : ""}`}
                    onClick={e => { e.stopPropagation(); onToggleFavorite(p.id); }}
                    aria-label={isFav ? `Remove ${p.name} from saved` : `Save ${p.name}`}
                    aria-pressed={isFav}
                  >{isFav ? "♥" : "♡"}</button>
                </div>
                <span className="property-item-addr">{p.address}{p.city ? `, ${p.city}` : ""}{p.state && p.state !== "CA" ? `, ${p.state}` : ""}</span>
                <div className="property-item-meta">
                  {p.affordableUnits > 0 && (
                    <span className="property-item-units">{p.affordableUnits} units</span>
                  )}
                  {p.populationTypes.length > 0 && (
                    <span className="property-item-pop">{p.populationTypes[0]}</span>
                  )}
                  {p.hasRentalAssistance && <span className="badge badge-blue">Sec. 8</span>}
                  <span className={`badge ${badge.cls}`}>{badge.text}</span>
                  {dist && <span className="property-item-dist">{dist}</span>}
                </div>
                {p.source === "lihtc" && (p.bedrooms.studio + p.bedrooms.br1 + p.bedrooms.br2 + p.bedrooms.br3 + p.bedrooms.br4plus) > 0 && (
                  <div className="bedroom-chips" aria-label="Bedroom breakdown">
                    {p.bedrooms.studio > 0 && <span className="br-chip">Studio×{p.bedrooms.studio}</span>}
                    {p.bedrooms.br1 > 0 && <span className="br-chip">1BR×{p.bedrooms.br1}</span>}
                    {p.bedrooms.br2 > 0 && <span className="br-chip">2BR×{p.bedrooms.br2}</span>}
                    {p.bedrooms.br3 > 0 && <span className="br-chip">3BR×{p.bedrooms.br3}</span>}
                    {p.bedrooms.br4plus > 0 && <span className="br-chip">4BR+×{p.bedrooms.br4plus}</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

// ── Skeleton loading rows ─────────────────────────────────────────────────────

function SkeletonList() {
  return (
    <div className="skeleton-list" aria-hidden="true" aria-label="Loading properties">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="skeleton-item">
          <div className="skeleton-line skeleton-name" />
          <div className="skeleton-line skeleton-addr" />
          <div className="skeleton-meta">
            <div className="skeleton-pill" />
            <div className="skeleton-pill skeleton-pill-sm" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ showFavsOnly, hasFilters, onClearFilters, onWidenSearch }: {
  showFavsOnly: boolean;
  hasFilters: boolean;
  onClearFilters: () => void;
  onWidenSearch?: () => void;
}) {
  if (showFavsOnly) {
    return (
      <div className="empty-state">
        <p className="empty-icon" aria-hidden="true">♡</p>
        <p>No saved properties yet.</p>
        <p className="empty-hint">Tap the heart on any property to save it.</p>
      </div>
    );
  }
  return (
    <div className="empty-state">
      <p className="empty-icon" aria-hidden="true">○</p>
      <p>No properties match your search.</p>
      {hasFilters && (
        <button className="empty-action-btn" onClick={onClearFilters}>Clear filters</button>
      )}
      {onWidenSearch && (
        <button className="empty-action-btn empty-action-secondary" onClick={onWidenSearch}>
          Widen search (40 km radius)
        </button>
      )}
      {!hasFilters && !onWidenSearch && (
        <p className="empty-hint">Try a different city or ZIP code.</p>
      )}
    </div>
  );
}

// ── Income qualification badges ───────────────────────────────────────────────

function QualificationBadges({ income, persons, ami }: { income: number; persons: number; ami: number }) {
  const sf = { 1: 0.70, 2: 0.80, 3: 0.90, 4: 1.00, 5: 1.08, 6: 1.16, 7: 1.24, 8: 1.32 };
  const factor = sf[Math.min(Math.max(persons, 1), 8) as keyof typeof sf] ?? 1.0;
  const adjAmi = ami * factor;
  const tiers = [
    { label: "ELI (30%)", pct: 0.30, color: "var(--tier-eli)" },
    { label: "VLI (50%)", pct: 0.50, color: "var(--tier-vli)" },
    { label: "LI (80%)",  pct: 0.80, color: "var(--tier-li)"  },
    { label: "Mod (120%)",pct: 1.20, color: "var(--tier-mod)" },
  ];
  const qualifies = tiers.filter(t => income <= adjAmi * t.pct);
  if (qualifies.length === 0) return (
    <p className="calc-note calc-none" role="status">Income exceeds all affordable tiers at this AMI.</p>
  );
  return (
    <div className="qual-badges" role="status" aria-label="Income qualification results">
      <span className="calc-note">You may qualify for:</span>
      {qualifies.map(t => (
        <span key={t.label} className="qual-badge" style={{ color: t.color }}>{t.label}</span>
      ))}
    </div>
  );
}

// ── Detail View ───────────────────────────────────────────────────────────────

interface DetailViewProps {
  property: DisplayProperty;
  isFav: boolean;
  onToggleFav: () => void;
  onClear: () => void;
  userLocation: UserLocation | null;
  ami: number;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }, [text]);
  return (
    <button
      className={`copy-btn ${copied ? "copied" : ""}`}
      onClick={handleCopy}
      aria-label={copied ? "Copied!" : `Copy ${label}`}
      title={copied ? "Copied!" : `Copy ${label}`}
    >{copied ? "✓" : "⎘"}</button>
  );
}

function DetailView({ property: p, isFav, onToggleFav, onClear, userLocation, ami }: DetailViewProps) {
  const badge = p.source === "lihtc"
    ? { text: "HUD LIHTC", cls: "badge-blue" }
    : p.arstatus === "Active"
    ? { text: "Active", cls: "badge-green" }
    : { text: p.arstatus ?? "Unknown", cls: "badge-gray" };

  const dist = userLocation && p.lat != null && p.lng != null
    ? fmtDist(haversineKm(userLocation.lat, userLocation.lng, p.lat, p.lng))
    : null;

  const fullAddress = [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ");
  const hasSJTiers = p.source === "sj" && ((p.eliunits ?? 0) + (p.vliunits ?? 0) + (p.liunits ?? 0) + (p.moderateunits ?? 0)) > 0;
  const hasBedroomData = (p.bedrooms.studio + p.bedrooms.br1 + p.bedrooms.br2 + p.bedrooms.br3 + p.bedrooms.br4plus) > 0;

  return (
    <div className="detail-card" role="region" aria-label={`Details for ${p.name}`}>
      <div className="detail-top-bar">
        <button className="back-btn" onClick={onClear} aria-label="Back to list">← Back</button>
        <div className="detail-top-right">
          {dist && <span className="detail-dist" aria-label={`${dist} from your location`}>{dist}</span>}
          <button
            className={`heart-btn large ${isFav ? "saved" : ""}`}
            onClick={onToggleFav}
            aria-label={isFav ? "Remove from saved" : "Save this property"}
            aria-pressed={isFav}
          >
            {isFav ? "♥" : "♡"}
          </button>
        </div>
      </div>

      <div className="detail-header">
        <h2>{p.name}</h2>
        <span className={`badge ${badge.cls}`}>{badge.text}</span>
      </div>

      {p.address && (
        <div className="detail-address-row">
          <p className="detail-address">
            {p.address}{p.city ? `, ${p.city}` : ""}{p.state ? `, ${p.state}` : ""} {p.zip}
          </p>
          <CopyButton text={fullAddress} label="address" />
        </div>
      )}

      <div className="contact-actions">
        {p.phone && (
          <div className="contact-item">
            <a className="contact-btn phone-btn" href={`tel:${p.phone.replace(/\s/g, "")}`} aria-label={`Call ${p.phone}`}>
              📞 {p.phone}
            </a>
            <CopyButton text={p.phone} label="phone number" />
          </div>
        )}
        {p.website && (
          <a className="contact-btn web-btn" href={p.website} target="_blank" rel="noreferrer" aria-label="Open property website in new tab">
            🔗 Website
          </a>
        )}
      </div>

      {/* SJ: income tier breakdown with rent table */}
      {hasSJTiers && (
        <div className="unit-breakdown">
          <div className="breakdown-title-row">
            <h3 className="breakdown-title">Affordable Units</h3>
            <span className="breakdown-total">{p.affordableUnits} units</span>
          </div>
          <div className="rent-table" role="table" aria-label="Rent ranges by income tier">
            <div className="rent-table-head" role="row">
              <span role="columnheader" />
              <span role="columnheader">Studio</span>
              <span role="columnheader">1 BR</span>
              <span role="columnheader">2 BR</span>
              <span role="columnheader">3 BR</span>
              <span role="columnheader">Units</span>
            </div>
            {(p.eliunits ?? 0) > 0 && <RentRow tier="ELI" label="Ext. Low" color="var(--tier-eli)" count={p.eliunits!} ami={ami} />}
            {(p.vliunits ?? 0) > 0 && <RentRow tier="VLI" label="Very Low" color="var(--tier-vli)" count={p.vliunits!} ami={ami} />}
            {(p.liunits ?? 0) > 0  && <RentRow tier="LI"  label="Low"      color="var(--tier-li)"  count={p.liunits!}  ami={ami} />}
            {(p.moderateunits ?? 0) > 0 && <RentRow tier="Moderate" label="Moderate" color="var(--tier-mod)" count={p.moderateunits!} ami={ami} />}
          </div>
          <p className="breakdown-note">Max rents per HUD 2024 limits. Actual rent may be lower.</p>
        </div>
      )}

      {/* LIHTC: bedroom counts + estimated rent by income ceiling */}
      {p.source === "lihtc" && (hasBedroomData || p.incomeCeilingPct) && (
        <div className="unit-breakdown">
          <div className="breakdown-title-row">
            <h3 className="breakdown-title">Unit Info</h3>
            {p.incomeCeilingPct && (
              <span className="badge badge-blue">≤{p.incomeCeilingPct}% AMI</span>
            )}
          </div>
          {hasBedroomData && (
            <div className="bedroom-breakdown">
              {p.bedrooms.studio > 0 && <BedroomTile label="Studio" count={p.bedrooms.studio} />}
              {p.bedrooms.br1 > 0 && <BedroomTile label="1 BR" count={p.bedrooms.br1} />}
              {p.bedrooms.br2 > 0 && <BedroomTile label="2 BR" count={p.bedrooms.br2} />}
              {p.bedrooms.br3 > 0 && <BedroomTile label="3 BR" count={p.bedrooms.br3} />}
              {p.bedrooms.br4plus > 0 && <BedroomTile label="4+ BR" count={p.bedrooms.br4plus} />}
            </div>
          )}
          {p.incomeCeilingPct && (
            <>
              <p className="breakdown-title" style={{ marginTop: 10, marginBottom: 6 }}>Est. Max Rent (30% of income)</p>
              {(() => {
                const r = rentRangeForTier(p.incomeCeilingPct, ami);
                return (
                  <div className="lihtc-rent-row">
                    <span>Studio <strong>{fmt(r.studio)}/mo</strong></span>
                    <span>1BR <strong>{fmt(r.oneBed)}/mo</strong></span>
                    <span>2BR <strong>{fmt(r.twoBed)}/mo</strong></span>
                    <span>3BR <strong>{fmt(r.threeBed)}/mo</strong></span>
                  </div>
                );
              })()}
              <p className="breakdown-note">Based on {ami >= 100000 ? `$${(ami/1000).toFixed(0)}k` : fmt(ami)} local AMI. Contact property for actual pricing.</p>
            </>
          )}
        </div>
      )}

      {/* Population + program tags */}
      {(p.populationTypes.length > 0 || p.hasRentalAssistance || p.isNonProfit) && (
        <div className="tag-row" aria-label="Property tags">
          {p.populationTypes.map(t => <span key={t} className="tag">{t}</span>)}
          {p.hasRentalAssistance && <span className="tag tag-blue">Rental Assistance</span>}
          {p.isNonProfit && <span className="tag">Non-Profit</span>}
        </div>
      )}

      <div className="detail-rows">
        <DetailRow label="Developer" value={p.developer} />
        {p.source === "sj" && <>
          <DetailRow label="Tenure" value={p.tenuretype} />
          <DetailRow label="Project Type" value={p.projecttype} />
          <DetailRow label="Stage" value={p.projdevstage} />
          <DetailRow label="Inclusionary" value={p.inclusionary} />
          <DetailRow label="Council District" value={p.councildistrict} />
        </>}
        {p.source === "lihtc" && <>
          <DetailRow label="Year Built" value={p.yearBuilt} />
          <DetailRow label="Total Units" value={p.totalUnits} />
        </>}
      </div>
    </div>
  );
}

function RentRow({ tier, label, color, count, ami }: {
  tier: "ELI" | "VLI" | "LI" | "Moderate";
  label: string; color: string; count: number; ami: number;
}) {
  const r = rentRangeForTier(tier, ami);
  return (
    <div className="rent-row" role="row">
      <span className="rent-tier-label" style={{ color }} role="cell">{label}</span>
      <span className="rent-cell" role="cell">{fmt(r.studio)}</span>
      <span className="rent-cell" role="cell">{fmt(r.oneBed)}</span>
      <span className="rent-cell" role="cell">{fmt(r.twoBed)}</span>
      <span className="rent-cell" role="cell">{fmt(r.threeBed)}</span>
      <span className="rent-units" role="cell">{count}</span>
    </div>
  );
}

function BedroomTile({ label, count }: { label: string; count: number }) {
  return (
    <div className="bedroom-tile">
      <span className="tier-count">{count}</span>
      <span className="tier-label">{label}</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: unknown }) {
  if (value == null || value === "" || value === 0) return null;
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{String(value)}</span>
    </div>
  );
}
