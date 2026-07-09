import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n/config";
import type { FilterState } from "../App";

const YEAR_BUILT_OPTIONS = [
  { label: "Any Year", value: undefined as number | undefined },
  { label: "2000+", value: 2000 },
  { label: "2005+", value: 2005 },
  { label: "2010+", value: 2010 },
  { label: "2015+", value: 2015 },
  { label: "2018+", value: 2018 },
  { label: "2020+", value: 2020 },
];

interface TopBarProps {
  searchDisplay?: string;
  hasSearched: boolean;
  loading: boolean;
  hhSize: number;
  onHhSizeChange: (n: number) => void;
  incomeValue: number;
  onIncomeChange: (v: number) => void;
  amiCeiling: number;
  onAmiCeilingChange: (v: number) => void;
  onSearch: (q: string) => void;
  onNearMe: () => void;
  onGoHome?: () => void;
  showMapView: boolean;
  onToggleMap: () => void;
  resultCount: number;
  dataSource: "sj" | "lihtc";
  showExpired: boolean;
  onToggleExpired: () => void;
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  onClearFilters: () => void;
  hasPublicData: boolean;
  onOpenAbout: () => void;
}

const HH_ICONS: { n: number; svg: React.ReactNode }[] = [
  { n: 1, svg: <SingleIcon /> },
  { n: 2, svg: <PairIcon /> },
  { n: 3, svg: <ThreeIcon /> },
  { n: 4, svg: <FourIcon /> },
  { n: 5, svg: <FiveIcon /> },
];

const INCOME_STOPS = [0, 20000, 35000, 50000, 65000, 80000, 100000, 130000, 160000, 200000];
const MAX_SLIDER = INCOME_STOPS.length - 1;

const AMI_STOPS = [0, 30, 50, 60, 80, 100, 120];
const AMI_MAX = AMI_STOPS.length - 1;

const LANGS: { code: string; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "vi", label: "VI" },
];

function sliderToAmi(v: number): number {
  return AMI_STOPS[Math.round(v)] ?? 0;
}

function amiLabel(v: number, t: (k: string) => string): string {
  if (v === 0) return t("ui.anyAmi");
  return `≤${v}% AMI`;
}

function sliderToIncome(v: number): number {
  return INCOME_STOPS[Math.round(v)] ?? 0;
}

function incomeLabel(v: number, t: (k: string) => string): string {
  if (v === 0) return t("ui.anyIncome");
  if (v >= 200000) return "$200k+";
  return `$${(v / 1000).toFixed(0)}k/yr`;
}

export function TopBar({
  searchDisplay, hasSearched, loading, hhSize, onHhSizeChange,
  incomeValue, onIncomeChange, amiCeiling, onAmiCeilingChange,
  onSearch, onNearMe, onGoHome, showMapView, onToggleMap, resultCount,
  dataSource, showExpired, onToggleExpired,
  filters, onFiltersChange, onClearFilters, hasPublicData, onOpenAbout,
}: TopBarProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [lang, setLang] = useState(i18n.language.slice(0, 2));
  const [moreOpen, setMoreOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [theme, setTheme] = useState<string>(
    () => (typeof document !== "undefined" && document.documentElement.dataset.theme) || "light"
  );
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch { /* ignore */ }
    setTheme(next);
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const secondaryActive = showExpired || filters.yearBuiltMin != null;
  const filtersActive =
    amiCeiling > 0 || incomeValue > 0 || hhSize !== 1 || secondaryActive ||
    !!filters.incomeTier || !!filters.bedroomSize || filters.voucherOnly ||
    filters.savedOnly || !!filters.populationType;

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [filterOpen]);

  const activeFilterCount =
    (hhSize !== 1 ? 1 : 0) + (amiCeiling > 0 ? 1 : 0) + (incomeValue > 0 ? 1 : 0);

  const sliderIdx = INCOME_STOPS.findIndex(s => s >= incomeValue);
  const sliderVal = sliderIdx < 0 ? MAX_SLIDER : sliderIdx;

  const amiSliderVal = AMI_STOPS.findIndex(s => s >= amiCeiling);
  const amiVal = amiSliderVal < 0 ? AMI_MAX : amiSliderVal;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) onSearch(input.trim());
  };

  const switchLang = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem("housing-lang", code);
    setLang(code);
  };

  return (
    <header className="topbar">
      <div className="topbar-brand">
        {onGoHome ? (
          <button className="topbar-home-btn" onClick={onGoHome} aria-label={t("ui.newSearch")} title={t("ui.newSearch")}>
            <HomeGlyph />
            <span>{t("ui.findHome")}</span>
          </button>
        ) : (
          <span className="topbar-title">{t("ui.findHome")}</span>
        )}
      </div>

      <form className="topbar-search" onSubmit={handleSubmit} role="search">
        <input
          ref={inputRef}
          className="topbar-search-input"
          placeholder={t("search.placeholder")}
          value={input}
          onChange={e => setInput(e.target.value)}
          aria-label={t("search.placeholder")}
          autoComplete="off"
        />
        <button className="topbar-search-btn" type="submit" disabled={loading} aria-label={t("search.button")}>
          {loading ? "…" : t("search.button")}
        </button>
        <button className="topbar-nearme-btn" type="button" onClick={onNearMe} disabled={loading} aria-label={t("search.nearMe")}>
          {t("search.nearMe")}
        </button>
      </form>

      <div className="topbar-controls">
        <div className="topbar-filters" ref={filterRef}>
          <button
            className={`topbar-filters-btn${activeFilterCount > 0 ? " has-active" : ""}`}
            onClick={() => setFilterOpen(v => !v)}
            aria-expanded={filterOpen}
            aria-haspopup="true"
            type="button"
          >
            {t("filters.title")}
            {activeFilterCount > 0 && <span className="topbar-filters-count">{activeFilterCount}</span>}
            <span className="topbar-more-caret" aria-hidden="true">▾</span>
          </button>
          {filterOpen && (
        <div className="topbar-filter-zone" role="group" aria-label={t("filters.title")}>
        <div className="topbar-control-group">
          <span className="topbar-control-label">{t("ui.household")}</span>
          <div className="hh-picker" role="group" aria-label="Household size">
            {HH_ICONS.map(({ n, svg }) => (
              <button
                key={n}
                className={`hh-btn${hhSize === n ? " selected" : ""}`}
                onClick={() => onHhSizeChange(n)}
                aria-pressed={hhSize === n}
                aria-label={`${n} ${n === 1 ? "person" : "people"}`}
                type="button"
              >
                {svg}
              </button>
            ))}
            {}
            {[6, 7, 8].map(n => (
              <button
                key={n}
                className={`hh-btn hh-btn-num${hhSize === n ? " selected" : ""}`}
                onClick={() => onHhSizeChange(n)}
                aria-pressed={hhSize === n}
                aria-label={`${n === 8 ? "8 or more" : n} people`}
                type="button"
              >
                {n === 8 ? "8+" : n}
              </button>
            ))}
          </div>
        </div>

        {}
        <div className="topbar-control-group topbar-income-group">
          <div className="topbar-income-label-row">
            <span className="topbar-control-label">{t("ui.amiLimit")}</span>
            <span className="topbar-income-value">{amiLabel(amiCeiling, t)}</span>
          </div>
          <input
            type="range"
            className="income-slider"
            min={0}
            max={AMI_MAX}
            step={1}
            value={amiVal}
            onChange={e => onAmiCeilingChange(sliderToAmi(Number(e.target.value)))}
            aria-label="Filter by maximum AMI percentage"
            aria-valuetext={amiLabel(amiCeiling, t)}
          />
        </div>

        {}
        <div className="topbar-control-group topbar-income-group">
          <div className="topbar-income-label-row">
            <span className="topbar-control-label">{t("ui.myIncome")}</span>
            <span className="topbar-income-value">{incomeLabel(incomeValue, t)}</span>
          </div>
          <input
            type="range"
            className="income-slider"
            min={0}
            max={MAX_SLIDER}
            step={1}
            value={sliderVal}
            onChange={e => onIncomeChange(sliderToIncome(Number(e.target.value)))}
            aria-label="Set your annual income to filter properties"
            aria-valuetext={incomeLabel(incomeValue, t)}
          />
        </div>
        </div>
          )}
        </div>

        <div className="topbar-tool-zone">
          {}
          {hasSearched && dataSource === "lihtc" && (
            <div className="topbar-more" ref={moreRef}>
              <button
                className={`topbar-more-btn${secondaryActive ? " has-active" : ""}`}
                onClick={() => setMoreOpen(v => !v)}
                aria-expanded={moreOpen}
                aria-haspopup="true"
                type="button"
              >
                {t("filters.more")}
                {secondaryActive && <span className="topbar-more-dot" aria-hidden="true" />}
                <span className="topbar-more-caret" aria-hidden="true">▾</span>
              </button>
              {moreOpen && (
                <div className="topbar-more-panel" role="group" aria-label={t("filters.more")}>
                  <button
                    className={`topbar-expiry-toggle${showExpired ? " active" : ""}`}
                    onClick={onToggleExpired}
                    type="button"
                    title="LIHTC properties built before 1996 may no longer be affordable"
                  >
                    {showExpired ? t("filters.hideExpired") : t("filters.showExpired")}
                  </button>
                  <div className="topbar-control-group">
                    <span className="topbar-control-label">{t("filters.yearBuiltMin")}</span>
                    <select
                      className="topbar-year-select"
                      value={filters.yearBuiltMin ?? ""}
                      onChange={e => {
                        const v = e.target.value === "" ? undefined : Number(e.target.value);
                        onFiltersChange({ ...filters, yearBuiltMin: v });
                      }}
                      aria-label={t("filters.yearBuiltMin")}
                    >
                      {YEAR_BUILT_OPTIONS.map(opt => (
                        <option key={opt.value ?? ""} value={opt.value ?? ""}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {hasSearched && filtersActive && (
            <button
              className="topbar-clear-filters"
              onClick={onClearFilters}
              type="button"
            >
              {t("filters.clearAll")}
            </button>
          )}

          {hasSearched && (
            <button
              className={`topbar-map-toggle${showMapView ? " active" : ""}`}
              onClick={onToggleMap}
              aria-pressed={showMapView}
              type="button"
            >
              {showMapView ? t("ui.list") : t("ui.map")}
            </button>
          )}

          <button
            className="topbar-theme-btn"
            onClick={toggleTheme}
            type="button"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
            )}
          </button>

          <button
            className="topbar-help-btn"
            onClick={onOpenAbout}
            type="button"
            aria-label={t("ui.help")}
            title={`${t("ui.help")} (?)`}
          >?</button>

          <span className="topbar-divider" aria-hidden="true" />

          <div className="topbar-lang-picker" role="group" aria-label="Language">
            {LANGS.map(({ code, label }) => (
              <button
                key={code}
                className={`topbar-lang-btn${lang === code ? " active" : ""}`}
                onClick={() => switchLang(code)}
                aria-pressed={lang === code}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>{}
      </div>

      {hasSearched && searchDisplay && (
        <div className="topbar-location-pill">
          <span>{searchDisplay.split(",").slice(0, 2).join(",")}</span>
          {resultCount > 0 && <span className="topbar-count">{resultCount} {t("ui.homes")}</span>}
          {dataSource !== "sj" && (
            <span className="topbar-freshness">
              {dataSource === "lihtc" && hasPublicData
                ? t("data.freshness.all")
                : dataSource === "lihtc"
                  ? t("data.freshness.lihtc")
                  : t("data.freshness.public")}
            </span>
          )}
        </div>
      )}
    </header>
  );
}

function HomeGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M8 2.2 2 7v6.3c0 .3.2.5.5.5H6V10h4v3.8h3.5c.3 0 .5-.2.5-.5V7L8 2.2Z"
        fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function PersonSvg({ x = 0 }: { x?: number }) {
  return (
    <g transform={`translate(${x}, 0)`}>
      <circle cx="4" cy="3" r="2.2" fill="currentColor" />
      <path d="M1 10c0-1.657 1.343-3 3-3s3 1.343 3 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </g>
  );
}

function SingleIcon() {
  return <svg width="16" height="14" viewBox="0 0 8 14" aria-hidden="true"><PersonSvg /></svg>;
}

function PairIcon() {
  return (
    <svg width="22" height="14" viewBox="0 0 16 14" aria-hidden="true">
      <PersonSvg x={0} />
      <PersonSvg x={8} />
    </svg>
  );
}

function ThreeIcon() {
  return (
    <svg width="30" height="14" viewBox="0 0 24 14" aria-hidden="true">
      <PersonSvg x={0} />
      <PersonSvg x={8} />
      <PersonSvg x={16} />
    </svg>
  );
}

function FourIcon() {
  return (
    <svg width="38" height="14" viewBox="0 0 32 14" aria-hidden="true">
      <PersonSvg x={0} />
      <PersonSvg x={8} />
      <PersonSvg x={16} />
      <PersonSvg x={24} />
    </svg>
  );
}

function FiveIcon() {
  return (
    <svg width="44" height="14" viewBox="0 0 40 14" aria-hidden="true">
      <PersonSvg x={0} />
      <PersonSvg x={8} />
      <PersonSvg x={16} />
      <PersonSvg x={24} />
      <PersonSvg x={32} />
    </svg>
  );
}
