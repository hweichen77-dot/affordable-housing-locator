import { useRef, useState, useCallback, useEffect } from "react";
import type { DisplayProperty, DataSource, MarketData, IlData, BrRents, RentcastListing } from "../types/housing";
import type { FilterState, UserLocation, AppStatuses, AppStatusValue } from "../App";
import { DEFAULT_FILTERS } from "../App";
import { rentRangeForTier, fmt } from "../lib/ami";
import { haversineKm, fmtDist } from "../lib/geo";
import { AboutModal } from "./AboutModal";

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
  onExportCsv?: () => void;
  onNearMe?: () => void;
  dataSource: DataSource;
  ami: number;
  searchDisplay?: string;
  hasSearched: boolean;
  applicationStatuses: AppStatuses;
  onSetAppStatus: (id: string, status: AppStatusValue | null) => void;
  marketData?: MarketData | null;
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
  onSearch, onWidenSearch, onGoHome, onExportFavorites, onExportCsv, onNearMe, dataSource, ami, searchDisplay, hasSearched,
  applicationStatuses, onSetAppStatus, marketData,
}: SidePanelProps) {
  const [searchInput, setSearchInput] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [showIncomeCalc, setShowIncomeCalc] = useState(false);
  const [nearMeLoading, setNearMeLoading] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("housing-search-history-v1");
      return raw ? JSON.parse(raw) as string[] : [];
    } catch { return []; }
  });
  const searchRef = useRef<HTMLInputElement>(null);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "/" || e.key === "s") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "?" || e.key === "i") { e.preventDefault(); setShowAbout(true); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

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

  const activeFilterCount = [
    dataSource === "sj" && !filters.activeOnly,
    filters.populationType !== "",
    filters.incomeTier !== "",
    filters.bedroomSize !== "",
    filters.voucherOnly,
    filters.sortBy !== "name",
    filters.householdIncome > 0,
    nameFilter.length > 0,
  ].filter(Boolean).length;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q) return;
    setSearchHistory(prev => {
      const next = [q, ...prev.filter(h => h.toLowerCase() !== q.toLowerCase())].slice(0, 3);
      localStorage.setItem("housing-search-history-v1", JSON.stringify(next));
      return next;
    });
    onSearch(q);
  };

  const handleHistoryClick = (q: string) => {
    setSearchInput(q);
    setSearchHistory(prev => {
      const next = [q, ...prev.filter(h => h.toLowerCase() !== q.toLowerCase())].slice(0, 3);
      localStorage.setItem("housing-search-history-v1", JSON.stringify(next));
      return next;
    });
    onSearch(q);
  };

  const handleNearMeClick = () => {
    if (!onNearMe || nearMeLoading) return;
    setNearMeLoading(true);
    onNearMe();
    setTimeout(() => setNearMeLoading(false), 8500);
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
    <>
    <aside className="side-panel" aria-label="Housing search and filters">
      {/* ── Header ── */}
      <div className="side-panel-header">
        <div className="header-title-row">
          <h1>Housing Locator</h1>
          <div className="header-actions">
            <button
              className="icon-btn about-btn"
              title="About this app"
              aria-label="About Affordable Housing Locator"
              onClick={() => setShowAbout(true)}
            >?</button>
            {onGoHome && (
              <button
                className="icon-btn home-btn"
                title="New search"
                aria-label="Clear search and start over"
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
            {onExportCsv && hasSearched && properties.length > 0 && (
              <button
                className="icon-btn"
                title="Export filtered results as CSV"
                aria-label="Export filtered results as CSV"
                onClick={onExportCsv}
              >CSV</button>
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
            placeholder="City, ZIP, or address — anywhere in the US"
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

        {(searchHistory.length > 0 || onNearMe) && (
          <div className="search-quick-row">
            {onNearMe && (
              <button
                className={`quick-chip near-me-chip ${nearMeLoading ? "loading" : ""}`}
                onClick={handleNearMeClick}
                disabled={nearMeLoading}
                aria-label="Search near my location"
                title="Find housing near me"
              >
                {nearMeLoading ? "…" : "Near me"}
              </button>
            )}
            {searchHistory.map(h => (
              <button
                key={h}
                className="quick-chip history-chip"
                onClick={() => handleHistoryClick(h)}
                title={`Search again: ${h}`}
                aria-label={`Repeat search: ${h}`}
              >{h}</button>
            ))}
          </div>
        )}

        {searchDisplay && (
          <p className="search-location-label" aria-live="polite">
            {searchDisplay.split(",").slice(0, 3).join(",")}
          </p>
        )}
        {hasSearched && dataSource === "lihtc" && (
          <p className="lihtc-info-banner" role="note">
            HUD LIHTC — federally funded affordable housing. Rents capped at 30% of income limit.
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

      {/* ── Filters (only shown after search) ── */}
      {hasSearched && <div className="filters-section" aria-label="Filters">
        {activeFilterCount > 0 && (
          <div className="filter-count-row" aria-live="polite">
            <span className="filter-count-badge" aria-label={`${activeFilterCount} active filter${activeFilterCount > 1 ? "s" : ""}`}>
              {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
            </span>
          </div>
        )}
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
            <AmiTierChart ami={ami} persons={filters.householdSize} />
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
            <option value="rent">Lowest rent</option>
          </select>
        </div>
      </div>}

      {/* ── Status ── */}
      <div className="side-panel-status" aria-live="polite">
        {loading && <p className="status-text">Searching…</p>}
        {error && (
          <div className="status-error-wrap">
            <p className="status-error" role="alert">{error}</p>
            <button className="retry-btn" onClick={onRetry} aria-label="Retry last search">Retry</button>
          </div>
        )}
        {!loading && !error && hasSearched && (
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
          bedroomSize={filters.bedroomSize}
          appStatus={applicationStatuses[selected.id] ?? null}
          onSetAppStatus={(s) => onSetAppStatus(selected.id, s)}
          marketData={marketData}
          householdIncome={filters.householdIncome}
        />
      ) : (
        <div
          className="property-list"
          role="list"
          aria-label="Housing properties"
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            const items = e.currentTarget.querySelectorAll<HTMLElement>(".property-item");
            const idx = Array.from(items).indexOf(document.activeElement as HTMLElement);
            const next = e.key === "ArrowDown" ? idx + 1 : idx - 1;
            items[Math.max(0, Math.min(next, items.length - 1))]?.focus();
          }}
        >
          {loading && <SkeletonList />}
          {!loading && !hasSearched && (
            <WelcomeState onSearch={onSearch} onNearMe={onNearMe} loading={loading} error={error} />
          )}
          {!loading && !error && hasSearched && displayed.length === 0 && (
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
            const appStatus = applicationStatuses[p.id];
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
                <span className="property-item-addr">
                  {p.address}{p.city ? `, ${p.city}` : ""}
                  {p.state ? `, ${p.state}` : ""}
                </span>
                <div className="property-item-meta">
                  {p.affordableUnits > 0 && (
                    <span className="property-item-units">{p.affordableUnits} units</span>
                  )}
                  {p.populationTypes.length > 0 && (
                    <span className="property-item-pop">{p.populationTypes[0]}</span>
                  )}
                  {p.hasRentalAssistance && <span className="badge badge-section8">Section 8 OK</span>}
                  <span className={`badge ${badge.cls}`}>{badge.text}</span>
                  {appStatus && (
                    <span className={`badge app-status-badge app-status-${appStatus}`}>
                      {appStatus === "interested" ? "Interested" : appStatus === "applied" ? "✓ Applied" : "Waitlisted"}
                    </span>
                  )}
                  {p.arExpiry != null && (() => {
                    const days = Math.floor((p.arExpiry - Date.now()) / 86400000);
                    if (days < 0) return <span className="badge badge-red" title="Affordability restriction has expired">Expired</span>;
                    if (days < 365) return <span className="badge badge-warn" title={`Affordability expires in ${days} days`}>Exp. soon</span>;
                    return null;
                  })()}
                  {p.source === "lihtc" && p.yearBuilt != null && (() => {
                    const expiryYear = p.yearBuilt + 30;
                    const currentYear = new Date().getFullYear();
                    const diff = expiryYear - currentYear;
                    if (diff < 0) return <span className="badge badge-red" title="LIHTC affordability period has expired">Expired</span>;
                    if (diff < 5) return <span className="badge badge-red" title={`LIHTC affordability expires ${expiryYear}`}>Exp. {expiryYear}</span>;
                    if (diff < 10) return <span className="badge badge-warn" title={`LIHTC affordability expires ${expiryYear}`}>Exp. {expiryYear}</span>;
                    return null;
                  })()}
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
                {p.source === "lihtc" && p.incomeCeilingPct && (() => {
                  const r = rentRangeForTier(p.incomeCeilingPct, ami);
                  const b = p.bedrooms;
                  const minRent = b.studio > 0 ? r.studio
                    : b.br1 > 0 ? r.oneBed
                    : b.br2 > 0 ? r.twoBed
                    : b.br3 > 0 ? r.threeBed
                    : r.studio;
                  return (
                    <span className="card-rent" aria-label={`Estimated rent from ${fmt(minRent)} per month`}>
                      From {fmt(minRent)}/mo · ≤{p.incomeCeilingPct}% AMI
                    </span>
                  );
                })()}
                {p.source === "sj" && ((p.eliunits ?? 0) + (p.vliunits ?? 0) + (p.liunits ?? 0) + (p.moderateunits ?? 0)) > 0 && (() => {
                  const lowestTier = (p.eliunits ?? 0) > 0 ? "ELI"
                    : (p.vliunits ?? 0) > 0 ? "VLI"
                    : (p.liunits ?? 0) > 0 ? "LI" : "Moderate";
                  const r = rentRangeForTier(lowestTier, ami);
                  return (
                    <span className="card-rent" aria-label={`Estimated rent from ${fmt(r.studio)} per month`}>
                      From {fmt(r.studio)}/mo ({lowestTier} tier)
                    </span>
                  );
                })()}
              </button>
            );
          })}
        </div>
      )}
    </aside>
    {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </>
  );
}

// ── Welcome state (before first search) ──────────────────────────────────────

const EXAMPLE_SEARCHES = ["San Jose, CA", "Seattle, WA", "Denver, CO", "Chicago, IL", "Miami, FL", "Austin, TX"];

function WelcomeState({ onSearch, onNearMe, loading, error }: { onSearch: (q: string) => void; onNearMe?: () => void; loading: boolean; error: string | null }) {
  return (
    <div className="welcome-state">
      <div className="welcome-hero">
        <p className="welcome-icon" aria-hidden="true"></p>
        <h2 className="welcome-title">Find Affordable Housing</h2>
        <p className="welcome-sub">Search 50,000+ subsidized properties across all 50 states</p>
      </div>

      <div className="welcome-stats" aria-label="Housing crisis facts">
        <div className="welcome-stat"><span className="welcome-stat-num">40M+</span><span className="welcome-stat-label">Americans cost-burdened by rent</span></div>
        <div className="welcome-stat"><span className="welcome-stat-num">50K+</span><span className="welcome-stat-label">subsidized properties searchable</span></div>
        <div className="welcome-stat"><span className="welcome-stat-num">50</span><span className="welcome-stat-label">states covered</span></div>
      </div>

      {error && (
        <p className="welcome-error" role="alert">Warning:{error}</p>
      )}

      {onNearMe && (
        <button
          className="welcome-near-me-btn"
          onClick={onNearMe}
          disabled={loading}
          aria-label="Search near my current location"
        >
          {loading ? "Finding housing near you…" : "Search near me"}
        </button>
      )}
      <div className="welcome-examples" aria-label="Example city searches">
        <p className="welcome-examples-label">Or try:</p>
        <div className="welcome-example-chips">
          {EXAMPLE_SEARCHES.map(city => (
            <button
              key={city}
              className="example-chip"
              onClick={() => onSearch(city)}
              aria-label={`Search affordable housing in ${city}`}
            >{city}</button>
          ))}
        </div>
      </div>
      <div className="welcome-data-note">
        <strong>San Jose</strong> includes detailed local data from the City of San Jose.<br />
        All other cities use <strong>HUD LIHTC</strong> — the federal affordable housing database.
      </div>
    </div>
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
          Widen search (60 km radius)
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

// ── AMI Tier Chart ────────────────────────────────────────────────────────────

function AmiTierChart({ ami, persons }: { ami: number; persons: number }) {
  const sf: Record<number, number> = { 1: 0.70, 2: 0.80, 3: 0.90, 4: 1.00, 5: 1.08, 6: 1.16, 7: 1.24, 8: 1.32 };
  const factor = sf[Math.min(Math.max(persons, 1), 8)] ?? 1.0;
  const adjAmi = ami * factor;
  const tiers = [
    { label: "ELI", desc: "≤30% AMI", pct: 0.30, color: "var(--tier-eli)" },
    { label: "VLI", desc: "≤50% AMI", pct: 0.50, color: "var(--tier-vli)" },
    { label: "LI",  desc: "≤80% AMI", pct: 0.80, color: "var(--tier-li)"  },
    { label: "Mod", desc: "≤120% AMI", pct: 1.20, color: "var(--tier-mod)" },
  ];
  return (
    <div className="ami-chart" aria-label="AMI income tier thresholds">
      <p className="ami-chart-title">{persons}-person household limits</p>
      {tiers.map(t => (
        <div key={t.label} className="ami-tier-row">
          <span className="ami-tier-label" style={{ color: t.color }}>{t.label}</span>
          <div className="ami-tier-bar" aria-hidden="true">
            <div className="ami-tier-fill" style={{ width: `${(t.pct / 1.20) * 100}%`, background: t.color }} />
          </div>
          <span className="ami-tier-amount" aria-label={`${t.desc}: up to $${Math.round(adjAmi * t.pct).toLocaleString()} per year`}>
            ≤${Math.round(adjAmi * t.pct).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Share Button ──────────────────────────────────────────────────────────────

function ShareButton({ property: p }: { property: DisplayProperty }) {
  const [copied, setCopied] = useState(false);
  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const parts = [
      p.name,
      [p.address, p.city, p.state, p.zip].filter(Boolean).join(", "),
      p.phone ? `Phone: ${p.phone}` : "",
      p.website ? `Website: ${p.website}` : "",
      p.affordableUnits ? `${p.affordableUnits} affordable units` : "",
      "How to apply: Contact property directly for waitlist and application info.",
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(parts.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }, [p]);
  return (
    <button
      className={`share-btn ${copied ? "copied" : ""}`}
      onClick={handleShare}
      aria-label={copied ? "Copied to clipboard" : "Copy property summary to clipboard"}
      title={copied ? "Copied!" : "Share property"}
    >{copied ? "✓" : "⎘"}</button>
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
  bedroomSize: FilterState["bedroomSize"];
  appStatus: AppStatusValue | null;
  onSetAppStatus: (s: AppStatusValue | null) => void;
  marketData?: MarketData | null;
  householdIncome?: number;
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

function DetailView({ property: p, isFav, onToggleFav, onClear, userLocation, ami, bedroomSize, appStatus, onSetAppStatus, marketData, householdIncome = 0 }: DetailViewProps) {
  const [guideOpen, setGuideOpen] = useState(false);
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
          <ShareButton property={p} />
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
              {p.phone}
            </a>
            <CopyButton text={p.phone} label="phone number" />
          </div>
        )}
        {p.website && (
          <a className="contact-btn web-btn" href={p.website} target="_blank" rel="noreferrer" aria-label="Open property website in new tab">
            Website
          </a>
        )}
      </div>

      {/* ── Application status tracker ── */}
      <div className="app-tracker" role="group" aria-label="My application status">
        <span className="app-tracker-label">My status:</span>
        <div className="app-tracker-btns">
          {(["interested", "applied", "waitlisted"] as AppStatusValue[]).map(s => (
            <button
              key={s}
              className={`app-tracker-btn${appStatus === s ? " active" : ""}`}
              data-status={s}
              onClick={() => onSetAppStatus(appStatus === s ? null : s)}
              aria-pressed={appStatus === s}
            >
              {s === "interested" ? "Interested" : s === "applied" ? "✓ Applied" : "Waitlisted"}
            </button>
          ))}
        </div>
      </div>

      <div className="apply-callout" role="note">
        {p.phone || p.website ? (
          <>
            <span className="apply-icon" aria-hidden="true">›</span>
            <div>
              <strong>How to apply:</strong> Contact the property directly about open units, waitlist status, and application requirements.
            </div>
          </>
        ) : (
          <>
            <span className="apply-icon" aria-hidden="true">›</span>
            <div>
              <strong>How to apply:</strong> Search for this property name online or contact your local housing authority about availability.
            </div>
          </>
        )}
      </div>

      {/* SJ: income tier breakdown with rent table */}
      {hasSJTiers && (
        <div className="unit-breakdown">
          <div className="breakdown-title-row">
            <h3 className="breakdown-title">Affordable Units</h3>
            <span className="breakdown-total">{p.affordableUnits} units</span>
          </div>
          {p.arExpiry != null && (() => {
            const days = Math.floor((p.arExpiry - Date.now()) / 86400000);
            const dateStr = new Date(p.arExpiry).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
            if (days < 0) return <p className="breakdown-note breakdown-warn">Warning:Affordability restriction expired {dateStr}</p>;
            if (days < 365) return <p className="breakdown-note breakdown-warn">Warning:Affordability expires {dateStr} ({days} days)</p>;
            return <p className="breakdown-note">Affordability restriction expires {dateStr}</p>;
          })()}
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
          <p className="breakdown-note">HUD-regulated max rents. Actual rent may be lower.</p>
        </div>
      )}

      {/* LIHTC: bedroom counts + unit-specific rent by income ceiling */}
      {p.source === "lihtc" && (hasBedroomData || p.incomeCeilingPct) && (
        <div className="unit-breakdown">
          <div className="breakdown-title-row">
            <h3 className="breakdown-title">Unit Info</h3>
            {p.incomeCeilingPct && (
              <span className="badge badge-blue">≤{p.incomeCeilingPct}% AMI</span>
            )}
            {!p.incomeCeilingPct && (
              <span className="badge badge-gray">Mixed AMI tiers</span>
            )}
          </div>

          {/* LIHTC expiry note */}
          {p.yearBuilt != null && (() => {
            const expiryYear = p.yearBuilt + 30;
            const currentYear = new Date().getFullYear();
            const diff = expiryYear - currentYear;
            if (diff < 0) return (
              <p className="breakdown-note breakdown-warn">
                Warning: LIHTC affordability period expired in {expiryYear} (built {p.yearBuilt})
              </p>
            );
            if (diff < 5) return (
              <p className="breakdown-note breakdown-warn">
                Warning: LIHTC affordability expires {expiryYear} — in {diff} year{diff !== 1 ? "s" : ""} (built {p.yearBuilt})
              </p>
            );
            if (diff < 10) return (
              <p className="breakdown-note">
                LIHTC affordability expires {expiryYear} (built {p.yearBuilt})
              </p>
            );
            return (
              <p className="breakdown-note">
                Affordability through {expiryYear} (built {p.yearBuilt})
              </p>
            );
          })()}

          {/* Mixed-tier: lower ceiling units */}
          {p.lowCeil && p.ceilUnit && (
            <p className="breakdown-note breakdown-info">
              {p.ceilUnit} units at ≤{p.lowCeil}% AMI · rest at ≤{p.incomeCeilingPct ?? "60"}% AMI
            </p>
          )}

          {hasBedroomData && (
            <div className="bedroom-breakdown">
              {p.bedrooms.studio > 0 && <BedroomTile label="Studio" count={p.bedrooms.studio} />}
              {p.bedrooms.br1 > 0 && <BedroomTile label="1 BR" count={p.bedrooms.br1} />}
              {p.bedrooms.br2 > 0 && <BedroomTile label="2 BR" count={p.bedrooms.br2} />}
              {p.bedrooms.br3 > 0 && <BedroomTile label="3 BR" count={p.bedrooms.br3} />}
              {p.bedrooms.br4plus > 0 && <BedroomTile label="4+ BR" count={p.bedrooms.br4plus} />}
            </div>
          )}

          {p.incomeCeilingPct && (() => {
            const r = rentRangeForTier(p.incomeCeilingPct, ami);
            const b = p.bedrooms;
            const hasBrData = b.studio + b.br1 + b.br2 + b.br3 + b.br4plus > 0;
            // Highlighted rent for selected bedroom filter
            const highlightLabel = bedroomSize === "0" ? "Studio"
              : bedroomSize === "1" ? "1 BR" : bedroomSize === "2" ? "2 BR"
              : bedroomSize === "3" ? "3 BR" : bedroomSize === "4" ? "4+ BR" : null;
            const highlightRent = bedroomSize === "0" ? r.studio
              : bedroomSize === "1" ? r.oneBed : bedroomSize === "2" ? r.twoBed
              : bedroomSize === "3" ? r.threeBed : null;
            return (
              <>
                {highlightLabel && highlightRent && (
                  <div className="rent-highlight-row">
                    <span className="rent-highlight-label">{highlightLabel} max rent</span>
                    <strong className="rent-highlight-val">{fmt(highlightRent)}/mo</strong>
                  </div>
                )}
                <p className="breakdown-title" style={{ marginTop: 10, marginBottom: 6 }}>
                  HUD Max Rent by bedroom (30% of income limit)
                </p>
                <div className="lihtc-rent-row">
                  {(!hasBrData || b.studio > 0) && <span>Studio <strong>{fmt(r.studio)}/mo</strong></span>}
                  {(!hasBrData || b.br1 > 0) && <span>1BR <strong>{fmt(r.oneBed)}/mo</strong></span>}
                  {(!hasBrData || b.br2 > 0) && <span>2BR <strong>{fmt(r.twoBed)}/mo</strong></span>}
                  {(!hasBrData || b.br3 > 0) && <span>3BR <strong>{fmt(r.threeBed)}/mo</strong></span>}
                </div>
                <p className="breakdown-note">Based on {ami >= 100000 ? `$${(ami/1000).toFixed(0)}k` : fmt(ami)} area AMI. These are HUD-regulated maximums — actual rent may be lower.</p>
              </>
            );
          })()}
        </div>
      )}

      {marketData?.nearby && marketData.nearby.length > 0 && (
        <NearbyListings listings={marketData.nearby} />
      )}

      {marketData?.il && (
        <IlRentTable il={marketData.il} property={p} />
      )}

      {marketData && (
        <SavingsCard
          property={p}
          marketData={marketData}
          ami={ami}
          householdIncome={householdIncome}
          bedroomSize={bedroomSize}
        />
      )}

      {/* Population + program tags */}
      {(p.populationTypes.length > 0 || p.hasRentalAssistance || p.isNonProfit) && (
        <div className="tag-row" aria-label="Property tags">
          {p.populationTypes.map(t => <span key={t} className="tag">{t}</span>)}
          {p.hasRentalAssistance && <span className="tag tag-section8">Section 8 OK</span>}
          {p.isNonProfit && <span className="tag">Non-Profit</span>}
        </div>
      )}

      <div className="detail-rows">
        <DetailRow label="Developer" value={p.developer} />
        {p.source === "sj" && <>
          <DetailRow label="Property Manager" value={p.propertyManager} />
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

      {/* Application guide */}
      <div className="app-guide">
        <button
          className="app-guide-toggle"
          onClick={() => setGuideOpen(v => !v)}
          aria-expanded={guideOpen}
        >
          Application guide {guideOpen ? "▲" : "▼"}
        </button>
        {guideOpen && (
          <div className="app-guide-body">
            <p className="guide-section-title">Typical documents needed:</p>
            <ul className="guide-list">
              <li>Government-issued photo ID for all adults</li>
              <li>Social Security cards for all household members</li>
              <li>Proof of income — pay stubs, tax returns, benefit award letters</li>
              <li>Bank statements (last 2–3 months)</li>
              <li>Rental history and references from previous landlords</li>
              <li>Birth certificates for minor children</li>
            </ul>
            <p className="guide-section-title">What to expect:</p>
            <p className="guide-note">Waitlists range from weeks to several years. Apply to multiple properties and keep your contact information current. Follow up every 3–6 months.</p>
            <p className="guide-section-title">Income verification tips:</p>
            <p className="guide-note">Affordable housing uses <em>gross</em> income (before taxes). Include all household members' income. Self-employed: provide tax returns + a profit/loss statement.</p>
          </div>
        )}
      </div>

      {/* External listings search */}
      <div className="listings-actions">
        <a
          className="listings-btn"
          href={`https://affordablehousingonline.com/search?name=${encodeURIComponent(p.name)}&city=${encodeURIComponent(p.city)}&state=${encodeURIComponent(p.state)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Search for current listings on Affordable Housing Online"
        >
          Search current listings ↗
        </a>
        {p.source === "lihtc" && (
          <a
            className="listings-btn listings-btn-secondary"
            href={`https://www.socialserve.com/state/${p.state.toLowerCase()}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Browse available units on Socialserve"
          >
            Browse Socialserve ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ── Nearby Active Listings ────────────────────────────────────────────────────
// Real rental prices pulled from Rentcast API — actual listings within 0.5 mi.

const BR_LABEL: Record<number, string> = { 0: "Studio", 1: "1BR", 2: "2BR", 3: "3BR", 4: "4BR+" };

function NearbyListings({ listings }: { listings: RentcastListing[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? listings : listings.slice(0, 5);

  return (
    <div className="nearby-wrap" aria-label="Nearby active rental listings">
      <div className="nearby-header">
        <span className="nearby-title">Nearby Active Rentals</span>
        <span className="nearby-subtitle">within 0.5 mi · actual prices</span>
      </div>
      <div className="nearby-list" role="list">
        {shown.map((l, i) => (
          <div key={i} className="nearby-item" role="listitem">
            <div className="nearby-item-left">
              <span className="nearby-br">{BR_LABEL[l.bedrooms] ?? `${l.bedrooms}BR`}</span>
              <span className="nearby-addr" title={l.address}>
                {l.address.split(",")[0]}
              </span>
              {l.square_footage && (
                <span className="nearby-sqft">{l.square_footage.toLocaleString()} sqft</span>
              )}
            </div>
            <div className="nearby-item-right">
              <strong className="nearby-price">{fmt(l.price)}</strong>
              <span className="nearby-mo">/mo</span>
              {l.days_on_market != null && (
                <span className="nearby-dom">{l.days_on_market}d listed</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {listings.length > 5 && (
        <button className="nearby-more" onClick={() => setExpanded(v => !v)}>
          {expanded ? "Show less ▲" : `Show all ${listings.length} listings ▼`}
        </button>
      )}
      <p className="nearby-source">Source: Rentcast · market-rate listings only</p>
    </div>
  );
}

// ── IL Rent Table ─────────────────────────────────────────────────────────────
// Shows HUD-regulated maximum rents per bedroom at each AMI tier.
// These ARE the actual maximum rents — properties cannot legally charge more.

function IlRentTable({ il, property: p }: { il: IlData; property: DisplayProperty }) {
  // Only show tiers relevant to the property's declared income ceiling
  const tiers: Array<{ label: string; key: keyof IlData; color: string; show: boolean }> = [
    { label: "30% AMI", key: "pct30", color: "var(--tier-eli)",  show: (p.incomeCeilingPct ?? 80) <= 30 || (p.eliunits ?? 0) > 0 },
    { label: "50% AMI", key: "pct50", color: "var(--tier-vli)",  show: (p.incomeCeilingPct ?? 80) <= 60 || (p.vliunits ?? 0) > 0 },
    { label: "60% AMI", key: "pct60", color: "var(--tier-li)",   show: (p.incomeCeilingPct ?? 60) <= 60 || (p.liunits ?? 0) > 0 },
    { label: "80% AMI", key: "pct80", color: "var(--tier-mod)",  show: (p.incomeCeilingPct ?? 80) >= 80 || (p.moderateunits ?? 0) > 0 },
  ];

  // Always show at least 50% and 60% (the two LIHTC standard tiers)
  const visibleTiers = tiers.filter(t => t.show || t.key === "pct50" || t.key === "pct60");

  return (
    <div className="il-table-wrap" aria-label="HUD regulated maximum rents by income tier">
      <div className="il-table-header">
        <span className="il-table-title">Maximum Rents (HUD IL {il.year})</span>
        <span className="il-table-area" title={il.area_name}>{il.area_name}</span>
      </div>
      <div className="il-table" role="table" aria-label="Regulated max rents per bedroom per AMI tier">
        <div className="il-table-row il-header-row" role="row">
          <span className="il-cell il-tier-col" role="columnheader">Tier</span>
          <span className="il-cell" role="columnheader">Studio</span>
          <span className="il-cell" role="columnheader">1BR</span>
          <span className="il-cell" role="columnheader">2BR</span>
          <span className="il-cell" role="columnheader">3BR</span>
        </div>
        {visibleTiers.map(tier => {
          const r = il[tier.key] as BrRents;
          return (
            <div key={tier.key} className="il-table-row" role="row">
              <span className="il-cell il-tier-col" style={{ color: tier.color }} role="cell">{tier.label}</span>
              <span className="il-cell" role="cell">{r.studio > 0 ? fmt(r.studio) : "—"}</span>
              <span className="il-cell" role="cell">{r.one_br > 0 ? fmt(r.one_br) : "—"}</span>
              <span className="il-cell" role="cell">{r.two_br > 0 ? fmt(r.two_br) : "—"}</span>
              <span className="il-cell" role="cell">{r.three_br > 0 ? fmt(r.three_br) : "—"}</span>
            </div>
          );
        })}
      </div>
      <p className="il-table-note">
        HUD-regulated maximums — properties cannot charge more. Actual rent may be lower.
        {il.median_income > 0 && <> Area median income: {fmt(il.median_income)}/yr.</>}
      </p>
    </div>
  );
}

// ── Savings Card ──────────────────────────────────────────────────────────────

function SavingsCard({ property: p, marketData, ami, householdIncome, bedroomSize }: {
  property: DisplayProperty;
  marketData: MarketData;
  ami: number;
  householdIncome: number;
  bedroomSize: FilterState["bedroomSize"];
}) {
  const { fmr, acs } = marketData;

  const pick = <T,>(br: FilterState["bedroomSize"], s: T, one: T, two: T, three: T, fallback: T): T => {
    if (br === "0") return s;
    if (br === "1") return one;
    if (br === "2") return two;
    if (br === "3" || br === "4") return three;
    return fallback;
  };

  const marketRent: number | null = acs
    ? (pick(bedroomSize, acs.studio, acs.one_br, acs.two_br, acs.three_br, acs.median_all) ?? acs.median_all)
    : null;

  const fmrRent: number | null = fmr
    ? pick(bedroomSize, fmr.efficiency, fmr.one_br, fmr.two_br, fmr.three_br, fmr.one_br)
    : null;

  const subsidizedRent: number = (() => {
    if (householdIncome > 0) return Math.round(householdIncome * 0.30 / 12);
    const tier =
      p.source === "sj"
        ? ((p.eliunits ?? 0) > 0 ? "ELI" : (p.vliunits ?? 0) > 0 ? "VLI" : (p.liunits ?? 0) > 0 ? "LI" : "Moderate")
        : (p.incomeCeilingPct ?? "LI") as "ELI" | "VLI" | "LI" | "Moderate" | number;
    const r = rentRangeForTier(tier, ami);
    return pick(bedroomSize, r.studio, r.oneBed, r.twoBed, r.threeBed, r.studio);
  })();

  if (!marketRent && !fmrRent) return null;

  const savings = marketRent ? marketRent - subsidizedRent : null;
  const yearlySavings = savings && savings > 0 ? savings * 12 : null;

  return (
    <div className="savings-card" aria-label="Market rent comparison">
      <div className="savings-card-title">
        Area Market Comparison
        {acs && <span className="savings-zip">ZIP {acs.zcta}</span>}
      </div>

      <div className="savings-rows">
        {marketRent && (
          <div className="savings-row">
            <span className="savings-label">Median market rent (ACS)</span>
            <span className="savings-market">{fmt(marketRent)}/mo</span>
          </div>
        )}
        {fmrRent && fmr && (
          <div className="savings-row">
            <span className="savings-label">
              HUD Fair Market Rent (FY{fmr.year})
              <span className="savings-hint" title="Maximum rent HUD covers under Section 8 / Housing Choice Vouchers"> ⓘ</span>
            </span>
            <span className="savings-fmr">{fmt(fmrRent)}/mo</span>
          </div>
        )}
        <div className="savings-divider" />
        <div className="savings-row">
          <span className="savings-label">
            {householdIncome > 0 ? "Your rent (30% of income)" : "Est. subsidized max"}
          </span>
          <span className="savings-yours">{fmt(subsidizedRent)}/mo</span>
        </div>
      </div>

      {yearlySavings && yearlySavings > 0 && (
        <div className="savings-highlight" aria-label={`You save ${fmt(savings!)}/mo vs market rate`}>
          <div className="savings-highlight-label">You save vs market</div>
          <div className="savings-highlight-amounts">
            <strong className="savings-highlight-month">{fmt(savings!)}/mo</strong>
            <span className="savings-highlight-year">${yearlySavings.toLocaleString()}/yr</span>
          </div>
        </div>
      )}

      {!fmr && (
        <p className="savings-note">
          Add <code>HUD_API_TOKEN</code> env var for Section 8 FMR data.
        </p>
      )}
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
