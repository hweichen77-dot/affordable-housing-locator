import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n/config";

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
}: TopBarProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [lang, setLang] = useState(i18n.language.slice(0, 2));
  const inputRef = useRef<HTMLInputElement>(null);

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
          <button className="topbar-home-btn" onClick={onGoHome} aria-label="Start over">
            {t("ui.findHome")}
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
        {/* Household size 1–8 */}
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
            {/* 6, 7, 8+ as numeric buttons */}
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

        {/* AMI ceiling slider */}
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

        {/* Income slider */}
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

        {/* Expiry toggle — only for LIHTC data */}
        {hasSearched && dataSource === "lihtc" && (
          <button
            className={`topbar-expiry-toggle${showExpired ? " active" : ""}`}
            onClick={onToggleExpired}
            type="button"
            title="LIHTC properties built before 1996 may no longer be affordable"
          >
            {showExpired ? t("filters.hideExpired") : t("filters.showExpired")}
          </button>
        )}

        {/* Map toggle */}
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

        {/* Language picker */}
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
      </div>

      {hasSearched && searchDisplay && (
        <div className="topbar-location-pill">
          <span>{searchDisplay.split(",").slice(0, 2).join(",")}</span>
          {resultCount > 0 && <span className="topbar-count">{resultCount} {t("ui.homes")}</span>}
        </div>
      )}
    </header>
  );
}

// ── People SVG icons ─────────────────────────────────────────────────────────

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
