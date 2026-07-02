import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { TopBar } from "./components/TopBar";
import { PropertyCard } from "./components/PropertyCard";
import { DetailPanel } from "./components/DetailPanel";
import { DeadlineWidget } from "./components/DeadlineWidget";
import { ComparePanel } from "./components/ComparePanel";
import { AmiSurvey, hasSurveyCompleted } from "./components/AmiSurvey";
import type { HousingCollection, GeoLocation, DisplayProperty } from "./types/housing";
import { normalizeFeatures, qualifiesForIncome, hasBedroomType, popMatches } from "./lib/normalize";
import { haversineKm } from "./lib/geo";
import { getAmi, maxRentFromAmi } from "./lib/ami";
import { AboutModal } from "./components/AboutModal";

const FullMap = lazy(() => import("./components/Map").then(m => ({ default: m.Map })));

export interface FilterState {
  activeOnly: boolean;
  populationType: string;
  incomeTier: "" | "ELI" | "VLI" | "LI" | "Moderate";
  bedroomSize: "" | "0" | "1" | "2" | "3" | "4";
  voucherOnly: boolean;
  savedOnly: boolean;
  sortBy: "name" | "units" | "distance" | "rent" | "match";
  householdIncome: number;
  householdSize: number;
  yearBuiltMin?: number;
}

export interface UserLocation { lng: number; lat: number; }

export type AppStatusValue = "interested" | "applied" | "waitlisted";
export type AppStatuses = Record<string, AppStatusValue>;

export const DEFAULT_FILTERS: FilterState = {
  activeOnly: true,
  populationType: "",
  incomeTier: "",
  bedroomSize: "",
  voucherOnly: false,
  savedOnly: false,
  sortBy: "name",
  householdIncome: 0,
  householdSize: 1,
};

function WelcomeScreen({ onSearch, onNearMe, loading, error, searchHistory }: {
  onSearch: (q: string) => void;
  onNearMe: () => void;
  loading: boolean;
  error: string | null;
  searchHistory: string[];
}) {
  const { t } = useTranslation();
  const cities = ["San Jose, CA", "Austin, TX", "Chicago, IL", "Seattle, WA", "Miami, FL", "Denver, CO"];
  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <span className="welcome-kicker">{t("welcome.kicker")}</span>
        <h1 className="welcome-heading">{t("welcome.heading")}</h1>
        <p className="welcome-sub">{t("welcome.sub")}</p>

        {error && <p className="welcome-error" role="alert">{error}</p>}

        <div className="welcome-actions">
          <button
            className="welcome-nearme-btn"
            onClick={onNearMe}
            disabled={loading}
            type="button"
          >
            {loading ? t("welcome.findingNearMe") : t("welcome.findNearMe")}
          </button>
          <span className="welcome-actions-hint">{t("welcome.searchHint")}</span>
        </div>

        {searchHistory.length > 0 && (
          <div className="welcome-quickstart">
            <span className="welcome-quickstart-label">{t("welcome.recentSearches")}</span>
            <div className="welcome-chips">
              {searchHistory.map(q => (
                <button key={q} className="welcome-chip welcome-chip-recent" onClick={() => onSearch(q)} type="button">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="welcome-quickstart">
          <span className="welcome-quickstart-label">{t("welcome.searchCity")}</span>
          <div className="welcome-chips">
            {cities.map(city => (
              <button key={city} className="welcome-chip" onClick={() => onSearch(city)} type="button">
                {city}
              </button>
            ))}
          </div>
        </div>

        <dl className="welcome-stats">
          <div className="welcome-stat">
            <dt className="welcome-stat-num">50,000+</dt>
            <dd className="welcome-stat-label">{t("welcome.statHomes")}</dd>
          </div>
          <div className="welcome-stat">
            <dt className="welcome-stat-num">50</dt>
            <dd className="welcome-stat-label">{t("welcome.statStates")}</dd>
          </div>
          <div className="welcome-stat">
            <dt className="welcome-stat-num">$0</dt>
            <dd className="welcome-stat-label">{t("welcome.statFree")}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="empty-screen">
      <div className="empty-inner">
        <span className="empty-mark" aria-hidden="true">—</span>
        <h2 className="empty-heading">{t("empty.heading")}</h2>
        <p className="empty-sub">{t("empty.sub")}</p>
        <button className="empty-reset-btn" onClick={onReset} type="button">
          {t("empty.clearFilters")}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [rawData, setRawData] = useState<DisplayProperty[]>([]);
  const [dataSource, setDataSource] = useState<"sj" | "lihtc">("sj");
  const [dataLoading, setDataLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchLocation, setSearchLocation] = useState<GeoLocation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("housing-search-history") ?? "[]"); }
    catch { return []; }
  });

  const [selectedProperty, setSelectedProperty] = useState<DisplayProperty | null>(null);
  const pendingSharedIdRef = useRef<string | null>(null);
  const [showMapView, setShowMapView] = useState(false);
  const [mapFly, setMapFly] = useState<{ lat: number; lng: number; zoom: number; bbox?: [number, number, number, number] } | null>(null);
  const [hhSize, setHhSize] = useState(1);
  const [incomeValue, setIncomeValue] = useState(0);
  const [amiCeiling, setAmiCeiling] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("housing-favorites-v2") ?? "[]")); }
    catch { return new Set(); }
  });
  const [showSurvey, setShowSurvey] = useState(() => !hasSurveyCompleted());
  const [appStatuses, setAppStatuses] = useState<AppStatuses>(() => {
    try { return JSON.parse(localStorage.getItem("housing-app-status-v1") ?? "{}"); }
    catch { return {}; }
  });
  const [deadlines, setDeadlines] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem("housing-deadlines-v1") ?? "{}"); }
    catch { return {}; }
  });
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());

  const [filters, setFilters] = useState<FilterState>(() => {
    try {
      const saved = localStorage.getItem("housing-filters-v1");
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<FilterState>;
        return { ...DEFAULT_FILTERS, ...parsed };
      }
    } catch {  }
    return DEFAULT_FILTERS;
  });
  const [showExpired, setShowExpired] = useState(false);

  const [showAbout, setShowAbout] = useState(false);
  const lastSearchRef = useRef<number>(0);
  const searchCounterRef = useRef<number>(0);

  useEffect(() => {
    if (!pendingSharedIdRef.current || rawData.length === 0) return;
    const id = pendingSharedIdRef.current;
    pendingSharedIdRef.current = null;
    const found = rawData.find(p => p.id === id);
    if (found) setSelectedProperty(found);
  }, [rawData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentId = params.get("id");
    if (selectedProperty) {
      // Carry the search query too so a shared link can re-run the search and
      // resolve the property for a recipient in a fresh session.
      if (searchQuery) params.set("q", searchQuery);
      if (currentId !== selectedProperty.id) {
        params.set("id", selectedProperty.id);
        window.history.replaceState(null, "", "?" + params.toString());
      }
    } else {
      if (currentId) {
        params.delete("id");
        const newSearch = params.toString();
        window.history.replaceState(null, "", newSearch ? "?" + newSearch : window.location.pathname);
      }
    }
  }, [selectedProperty, searchQuery]);

  useEffect(() => {
    try { localStorage.setItem("housing-filters-v1", JSON.stringify(filters)); } catch {  }
  }, [filters]);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setIncomeValue(0);
    setAmiCeiling(0);
    try { localStorage.removeItem("housing-filters-v1"); } catch {  }
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;
    const myCount = ++searchCounterRef.current;
    const now = Date.now();
    const gap = now - lastSearchRef.current;
    if (gap < 500) await new Promise(r => setTimeout(r, 500 - gap));
    if (myCount !== searchCounterRef.current) return;
    lastSearchRef.current = Date.now();

    setSearchQuery(query);
    setSearchError(null);
    setSearchLoading(true);
    setSelectedProperty(null);

    try {
      const loc = await invoke<GeoLocation>("geocode", { query });
      if (myCount !== searchCounterRef.current) return;
      setSearchLocation(loc);
      setMapFly({ lat: loc.lat, lng: loc.lng, zoom: 12, bbox: loc.bbox as [number, number, number, number] });

      const cityPart = loc.display_name.split(",")[0].trim().toLowerCase();
      const displayLower = loc.display_name.toLowerCase();
      const isSJ = cityPart === "san jose"
        && (displayLower.includes("california") || displayLower.includes(", ca,") || displayLower.includes(", ca "));

      setDataLoading(true);

      if (isSJ) {
        const d = await invoke<HousingCollection>("fetch_housing");
        if (myCount !== searchCounterRef.current) return;
        setRawData(normalizeFeatures(d.features, "sj"));
        setDataSource("sj");
      } else {
        const [d, pubD] = await Promise.all([
          invoke<HousingCollection>("fetch_lihtc", { lat: loc.lat, lng: loc.lng, radiusKm: 25 }),
          invoke<HousingCollection>("fetch_public_housing", { lat: loc.lat, lng: loc.lng, radiusKm: 25 })
            .catch(() => ({ type: "FeatureCollection", features: [] } as HousingCollection)),
        ]);
        if (myCount !== searchCounterRef.current) return;
        setRawData([
          ...normalizeFeatures(d.features, "lihtc"),
          ...normalizeFeatures(pubD.features, "public"),
        ]);
        setDataSource("lihtc");
      }

      setHasSearched(true);
      setDataLoading(false);
      setSearchLoading(false);
      setSearchHistory(prev => {
        const next = [query, ...prev.filter(q => q !== query)].slice(0, 5);
        try { localStorage.setItem("housing-search-history", JSON.stringify(next)); } catch {  }
        return next;
      });
    } catch (e) {
      if (myCount !== searchCounterRef.current) return;
      const msg = typeof e === "string" ? e : JSON.stringify(e);
      if (msg.includes("Not found") || msg.includes("No results")) {
        setSearchError(`No results for "${query}". Try a different city or ZIP code.`);
      } else {
        setSearchError("Search failed. Check your connection and try again.");
      }
      setHasSearched(true);
      setSearchLoading(false);
      setDataLoading(false);
    }
  }, []);

  // Resolve a shared link (?id=&q=): re-run the search so rawData populates,
  // then the effect below selects the shared property once it arrives.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get("id");
    const q = params.get("q");
    if (sharedId) pendingSharedIdRef.current = sharedId;
    if (q) handleSearch(q);
  }, [handleSearch]);

  // Open the help/about guide with "?" (matches the shortcut listed inside it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (!typing && e.key === "?") { e.preventDefault(); setShowAbout(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleNearMe = useCallback(() => {
    if (!navigator.geolocation) {
      setSearchError("Geolocation is not available. Please search by city name.");
      return;
    }
    setDataLoading(true);
    setSearchError(null);
    setSelectedProperty(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserLocation({ lat, lng });
        setMapFly({ lat, lng, zoom: 12 });
        try {
          const [loc, d, pubD] = await Promise.all([
            invoke<GeoLocation>("reverse_geocode", { lat, lng }).catch(() => null),
            invoke<HousingCollection>("fetch_lihtc", { lat, lng, radiusKm: 25 }),
            invoke<HousingCollection>("fetch_public_housing", { lat, lng, radiusKm: 25 })
              .catch(() => ({ type: "FeatureCollection", features: [] } as HousingCollection)),
          ]);
          if (loc) setSearchLocation(loc);
          setRawData([
            ...normalizeFeatures(d.features, "lihtc"),
            ...normalizeFeatures(pubD.features, "public"),
          ]);
          setDataSource("lihtc");
          setHasSearched(true);
          setDataLoading(false);
        } catch {
          setSearchError("Couldn't find homes near your location. Try searching by city or ZIP code.");
          setDataLoading(false);
          setHasSearched(true);
        }
      },
      (err) => {
        setDataLoading(false);
        const msg =
          err.code === 1 ? "Location access was denied. Please search by city or ZIP code." :
          err.code === 3 ? "Location request timed out. Try searching by city name." :
          "Couldn't get your location. Try searching by city name.";
        setSearchError(msg);
      },
      { enableHighAccuracy: true, timeout: 8500 }
    );
  }, []);

  const handleGoHome = useCallback(() => {
    setRawData([]);
    setDataSource("sj");
    setSearchQuery("");
    setSearchLocation(null);
    setSelectedProperty(null);
    setHasSearched(false);
    setSearchError(null);
    setShowMapView(false);
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("housing-favorites-v2", JSON.stringify([...next]));
      return next;
    });
  }, []);

  // Export currently-loaded saved properties to a plain-text file.
  const exportFavorites = useCallback(() => {
    const saved = rawData.filter(p => favorites.has(p.id));
    if (saved.length === 0) return;
    const lines = saved.map(p => {
      const parts = [
        p.name,
        [p.address, p.city, p.state, p.zip].filter(Boolean).join(", "),
        p.phone ? `Phone: ${p.phone}` : "",
        p.website ? `Website: ${p.website}` : "",
        p.incomeCeilingPct != null ? `Income limit: <=${p.incomeCeilingPct}% AMI` : "",
        p.affordableUnits ? `Affordable units: ${p.affordableUnits}` : "",
        appStatuses[p.id] ? `Status: ${appStatuses[p.id]}` : "",
      ].filter(Boolean);
      return parts.join("\n");
    });
    const header = `Affordable Housing Locator — Saved Properties (${saved.length})\n${"=".repeat(48)}\n\n`;
    const blob = new Blob([header + lines.join("\n\n" + "-".repeat(32) + "\n\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "saved-housing.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [rawData, favorites, appStatuses]);

  const handleStatusChange = useCallback((id: string, status: AppStatusValue | null) => {
    setAppStatuses(prev => {
      const next = { ...prev };
      if (status === null) {
        delete next[id];
      } else {
        next[id] = status;
      }
      try { localStorage.setItem("housing-app-status-v1", JSON.stringify(next)); } catch {  }
      return next;
    });
  }, []);

  const setDeadline = useCallback((id: string, ms: number | null) => {
    setDeadlines(prev => {
      const next = { ...prev };
      if (ms === null) {
        delete next[id];
      } else {
        next[id] = ms;
      }
      try { localStorage.setItem("housing-deadlines-v1", JSON.stringify(next)); } catch {  }
      return next;
    });
  }, []);

  const toggleCompare = useCallback((id: string) => {
    setCompareIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 3) return prev;
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearCompare = useCallback(() => setCompareIds(new Set()), []);

  const handleSurveyComplete = useCallback((filterPatch: Partial<FilterState>, locationQuery: string) => {
    setShowSurvey(false);
    if (filterPatch.householdSize) setHhSize(filterPatch.householdSize);
    if (filterPatch.householdIncome) setIncomeValue(filterPatch.householdIncome);
    setFilters(f => ({ ...f, ...filterPatch }));
    if (locationQuery) {
      handleSearch(locationQuery);
    } else {
      handleNearMe();
    }
  }, [handleSearch, handleNearMe]);

  const handleSurveySkip = useCallback(() => {
    setShowSurvey(false);
    try { localStorage.setItem("housing-survey-v1", "skipped"); } catch {  }
  }, []);

  const ami = useMemo(() => {
    if (!searchLocation) return 97800;
    const city = searchLocation.display_name.split(",")[0];
    const state = rawData[0]?.state ?? "CA";
    return getAmi(state, city);
  }, [searchLocation, rawData]);

  const filtered = useMemo<DisplayProperty[]>(() => {
    let items = rawData;

    if (filters.activeOnly && dataSource === "sj") {
      items = items.filter(p => p.arstatus === "Active");
    }

    if (!showExpired && dataSource === "lihtc") {
      items = items.filter(p => !p.isLikelyExpired);
    }

    if (incomeValue > 0) {
      items = items.filter(p => qualifiesForIncome(p, incomeValue, hhSize, ami));
    }

    if (amiCeiling > 0) {
      items = items.filter(p =>
        p.incomeCeilingPct == null || p.incomeCeilingPct <= amiCeiling
      );
    }

    // Income tier from the survey → keep properties the household is eligible
    // for: their AMI% must be at or below the property's income ceiling.
    if (filters.incomeTier) {
      const tierPct = { ELI: 30, VLI: 50, LI: 80, Moderate: 120 }[filters.incomeTier];
      items = items.filter(p => p.incomeCeilingPct == null || tierPct <= p.incomeCeilingPct);
    }

    if (filters.bedroomSize) {
      items = items.filter(p => hasBedroomType(p, filters.bedroomSize));
    }

    if (filters.populationType) {
      items = items.filter(p => popMatches(p, filters.populationType));
    }

    if (filters.voucherOnly) {
      items = items.filter(p => p.hasRentalAssistance);
    }

    if (filters.savedOnly) {
      items = items.filter(p => favorites.has(p.id));
    }

    if (filters.yearBuiltMin != null) {
      items = items.filter(p =>
        p.source !== "lihtc" || (p.yearBuilt != null && p.yearBuilt >= filters.yearBuiltMin!)
      );
    }

    const dist = (p: DisplayProperty) =>
      userLocation && p.lat != null && p.lng != null
        ? haversineKm(userLocation.lat, userLocation.lng, p.lat, p.lng)
        : Infinity;

    // Estimated max monthly rent: 30% of the size-adjusted income limit at the
    // property's AMI tier (default 60% AMI when the ceiling is unknown).
    const estRent = (p: DisplayProperty) =>
      maxRentFromAmi(ami * ((p.incomeCeilingPct ?? 60) / 100), hhSize);

    return [...items].sort((a, b) => {
      switch (filters.sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "distance":
          return dist(a) - dist(b);
        case "units":
          return (b.affordableUnits || 0) - (a.affordableUnits || 0);
        case "rent":
          return estRent(a) - estRent(b);
        case "match": {
          if (incomeValue > 0) {
            const aQ = qualifiesForIncome(a, incomeValue, hhSize, ami);
            const bQ = qualifiesForIncome(b, incomeValue, hhSize, ami);
            if (aQ !== bQ) return aQ ? -1 : 1;
          }
          return dist(a) - dist(b);
        }
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [rawData, filters, dataSource, incomeValue, hhSize, ami, amiCeiling, userLocation, showExpired, favorites]);

  const mapData = useMemo<HousingCollection>(() => ({
    type: "FeatureCollection",
    features: filtered
      .filter(p => p.lat != null && p.lng != null)
      .map(p => ({
        type: "Feature" as const,
        id: p.id,
        geometry: { type: "Point" as const, coordinates: [p.lng!, p.lat!] },
        properties: { ...p.raw, _displayId: p.id },
      })),
  }), [filtered]);

  const handleIncomeChange = useCallback((v: number) => {
    setIncomeValue(v);
    setFilters(f => ({ ...f, householdIncome: v }));
  }, []);

  const handleHhChange = useCallback((n: number) => {
    setHhSize(n);
    setFilters(f => ({ ...f, householdSize: n }));
  }, []);

  const handleSelectFromMap = useCallback((rawProps: Record<string, unknown>) => {
    const id = String(rawProps._displayId ?? "");
    const found = filtered.find(p => p.id === id) ?? rawData.find(p => p.id === id);
    if (found) setSelectedProperty(found);
  }, [filtered, rawData]);

  const loading = dataLoading || searchLoading;

  return (
    <>
      {showSurvey && (
        <AmiSurvey onComplete={handleSurveyComplete} onSkip={handleSurveySkip} />
      )}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

      <div className="new-app-layout">
        <TopBar
          searchDisplay={searchLocation?.display_name}
          hasSearched={hasSearched}
          loading={loading}
          hhSize={hhSize}
          onHhSizeChange={handleHhChange}
          incomeValue={incomeValue}
          onIncomeChange={handleIncomeChange}
          amiCeiling={amiCeiling}
          onAmiCeilingChange={setAmiCeiling}
          onSearch={handleSearch}
          onNearMe={handleNearMe}
          onGoHome={hasSearched ? handleGoHome : undefined}
          showMapView={showMapView}
          onToggleMap={() => setShowMapView(v => !v)}
          resultCount={filtered.length}
          dataSource={dataSource}
          showExpired={showExpired}
          onToggleExpired={() => setShowExpired(v => !v)}
          filters={filters}
          onFiltersChange={setFilters}
          onClearFilters={clearFilters}
          hasPublicData={rawData.some(p => p.source === "public")}
          onOpenAbout={() => setShowAbout(true)}
        />

        {}
        {showMapView && hasSearched && (
          <div className="map-fullview">
            <Suspense fallback={<div className="map-loading" />}>
              <FullMap
                data={mapData}
                userLocation={userLocation}
                mapFly={mapFly}
                dataSource={dataSource}
                selectedId={selectedProperty?.id ?? null}
                onSelectFeature={props => { handleSelectFromMap(props); }}
                onLocate={loc => setUserLocation(loc)}
              />
            </Suspense>
          </div>
        )}

        {}
        <div className={`content-area${selectedProperty ? " has-detail" : ""}`}>
          {}
          <div className="card-grid-area">
            {!hasSearched && (
              <WelcomeScreen
                onSearch={handleSearch}
                onNearMe={handleNearMe}
                loading={loading}
                error={searchError}
                searchHistory={searchHistory}
              />
            )}

            {hasSearched && loading && (
              <div className="loading-grid">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="skeleton-card">
                    <div className="skeleton-hero" />
                    <div className="skeleton-body">
                      <div className="skeleton-line" />
                      <div className="skeleton-line short" />
                      <div className="skeleton-btns" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {hasSearched && !loading && (
              <DeadlineWidget
                properties={rawData}
                deadlines={deadlines}
                onSelect={setSelectedProperty}
              />
            )}

            {hasSearched && !loading && (() => {
              const savedCount = rawData.filter(p => favorites.has(p.id)).length;
              const trackingCount = rawData.filter(p => appStatuses[p.id]).length;
              if (savedCount === 0 && trackingCount === 0) return null;
              return (
                <div className="results-filter-bar">
                  {savedCount > 0 && (
                    <button
                      className={`results-filter-chip${filters.savedOnly ? " active" : ""}`}
                      onClick={() => setFilters(f => ({ ...f, savedOnly: !f.savedOnly }))}
                      type="button"
                    >
                      Saved ({savedCount})
                    </button>
                  )}
                  {trackingCount > 0 && (
                    <button
                      className={`results-filter-chip${filters.savedOnly ? "" : ""}`}
                      onClick={() => setFilters(f => ({ ...f, savedOnly: false }))}
                      type="button"
                      style={{ opacity: 0.7 }}
                    >
                      Tracking ({trackingCount})
                    </button>
                  )}
                  {(filters.savedOnly) && (
                    <button
                      className="results-filter-clear"
                      onClick={() => setFilters(f => ({ ...f, savedOnly: false }))}
                      type="button"
                    >
                      Show all
                    </button>
                  )}
                  {savedCount > 0 && (
                    <button
                      className="results-filter-clear"
                      onClick={exportFavorites}
                      type="button"
                    >
                      Export saved
                    </button>
                  )}
                </div>
              );
            })()}

            {hasSearched && !loading && filtered.length === 0 && (
              <EmptyState onReset={() => { setIncomeValue(0); setAmiCeiling(0); setFilters(DEFAULT_FILTERS); }} />
            )}

            {hasSearched && !loading && filtered.length > 0 && (
              <div className="prop-grid">
                {filtered.map(p => (
                  <PropertyCard
                    key={p.id}
                    property={p}
                    userLocation={userLocation}
                    saved={favorites.has(p.id)}
                    appStatus={appStatuses[p.id]}
                    onSelect={setSelectedProperty}
                    onSave={toggleFavorite}
                    onStatusChange={handleStatusChange}
                    comparing={compareIds.has(p.id)}
                    onToggleCompare={toggleCompare}
                  />
                ))}
              </div>
            )}
          </div>

          {}
          {selectedProperty && (
            <DetailPanel
              property={selectedProperty}
              userLocation={userLocation}
              ami={ami}
              userIncome={incomeValue}
              userHhSize={hhSize}
              saved={favorites.has(selectedProperty.id)}
              appStatus={appStatuses[selectedProperty.id]}
              deadline={deadlines[selectedProperty.id]}
              onClose={() => setSelectedProperty(null)}
              onSave={toggleFavorite}
              onStatusChange={handleStatusChange}
              onSetDeadline={setDeadline}
            />
          )}
        </div>

        {}
        {compareIds.size >= 2 && (
          <ComparePanel
            properties={rawData.filter(p => compareIds.has(p.id))}
            userLocation={userLocation}
            appStatuses={appStatuses}
            deadlines={deadlines}
            onClear={clearCompare}
            onRemove={toggleCompare}
            onSelect={setSelectedProperty}
          />
        )}
      </div>
    </>
  );
}
