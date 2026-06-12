import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { TopBar } from "./components/TopBar";
import { PropertyCard } from "./components/PropertyCard";
import { DetailPanel } from "./components/DetailPanel";
import { AmiSurvey, hasSurveyCompleted } from "./components/AmiSurvey";
import type { HousingCollection, GeoLocation, DisplayProperty, MarketData, FmrData, AcsRentData, IlData, RentcastListing } from "./types/housing";
import { normalizeFeatures, qualifiesForIncome, hasBedroomType, popMatches } from "./lib/normalize";
import { haversineKm } from "./lib/geo";
import { getAmi } from "./lib/ami";

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

// Welcome screen shown when no search yet
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
        <div className="welcome-icon-wrap">
          <svg viewBox="0 0 40 36" fill="none" aria-hidden="true" className="welcome-svg">
            <path d="M20 3L2 16h4v17h10V22h8v11h10V16h4L20 3z"
              stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="welcome-heading">{t("welcome.heading")}</h2>
        <p className="welcome-sub">{t("welcome.sub")}</p>

        {error && <p className="welcome-error" role="alert">{error}</p>}

        <button
          className="welcome-nearme-btn"
          onClick={onNearMe}
          disabled={loading}
          type="button"
        >
          {loading ? t("welcome.findingNearMe") : t("welcome.findNearMe")}
        </button>

        {searchHistory.length > 0 && (
          <>
            <p className="welcome-or">{t("welcome.recentSearches")}</p>
            <div className="welcome-chips">
              {searchHistory.map(q => (
                <button key={q} className="welcome-chip welcome-chip-recent" onClick={() => onSearch(q)} type="button">
                  {q}
                </button>
              ))}
            </div>
          </>
        )}

        <p className="welcome-or">{t("welcome.searchCity")}</p>

        <div className="welcome-chips">
          {cities.map(city => (
            <button key={city} className="welcome-chip" onClick={() => onSearch(city)} type="button">
              {city}
            </button>
          ))}
        </div>

        <p className="welcome-note">{t("welcome.note")}</p>
      </div>
    </div>
  );
}

// Empty state after search with no results
function EmptyState({ onReset }: { onReset: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="empty-screen">
      <p className="empty-icon">○</p>
      <p className="empty-heading">{t("empty.heading")}</p>
      <p className="empty-sub">{t("empty.sub")}</p>
      <button className="empty-reset-btn" onClick={onReset} type="button">
        {t("empty.clearFilters")}
      </button>
    </div>
  );
}

export default function App() {
  // ── Data state ────────────────────────────────────────────────────────────
  const [rawData, setRawData] = useState<DisplayProperty[]>([]);
  const [dataSource, setDataSource] = useState<"sj" | "lihtc">("sj");
  const [dataLoading, setDataLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchLocation, setSearchLocation] = useState<GeoLocation | null>(null);
  const [_searchQuery, setSearchQuery] = useState("");
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("housing-search-history") ?? "[]"); }
    catch { return []; }
  });

  // ── UI state ─────────────────────────────────────────────────────────────
  const [selectedProperty, setSelectedProperty] = useState<DisplayProperty | null>(null);
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

  // ── Filters (mostly for internal logic, income/hh exposed via UI state) ──
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [showExpired, setShowExpired] = useState(false);

  const [_marketData, setMarketData] = useState<MarketData | null>(null);
  const marketCacheRef = useRef<Record<string, MarketData>>({});
  const lastSearchRef = useRef<number>(0);
  const searchCounterRef = useRef<number>(0);

  // Market data fetch on property select
  useEffect(() => {
    if (!selectedProperty?.zip) { setMarketData(null); return; }
    const zip = selectedProperty.zip.replace(/\D/g, "").slice(0, 5);
    if (zip.length !== 5) { setMarketData(null); return; }
    if (marketCacheRef.current[zip]) { setMarketData(marketCacheRef.current[zip]); return; }
    let cancelled = false;
    const { lat, lng } = selectedProperty;
    Promise.all([
      invoke<FmrData | null>("fetch_fmr", { zip }).catch(() => null),
      invoke<AcsRentData | null>("fetch_acs_rent", { zip }).catch(() => null),
      invoke<IlData | null>("fetch_il", { zip }).catch(() => null),
      lat != null && lng != null
        ? invoke<RentcastListing[]>("fetch_nearby_rentals", { lat, lng }).catch(() => [])
        : Promise.resolve([] as RentcastListing[]),
    ]).then(([fmr, acs, il, nearby]) => {
      if (cancelled) return;
      const data: MarketData = { fmr, acs, il, nearby: nearby ?? [] };
      marketCacheRef.current[zip] = data;
      setMarketData(data);
    });
    return () => { cancelled = true; };
  }, [selectedProperty?.zip]);

  // ── City / ZIP search ─────────────────────────────────────────────────────
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
        const d = await invoke<HousingCollection>("fetch_lihtc", { lat: loc.lat, lng: loc.lng, radiusKm: 25 });
        if (myCount !== searchCounterRef.current) return;
        setRawData(normalizeFeatures(d.features, "lihtc"));
        setDataSource("lihtc");
      }

      setHasSearched(true);
      setDataLoading(false);
      setSearchLoading(false);
      // Save to search history (last 5 unique successful searches)
      setSearchHistory(prev => {
        const next = [query, ...prev.filter(q => q !== query)].slice(0, 5);
        try { localStorage.setItem("housing-search-history", JSON.stringify(next)); } catch { /* */ }
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

  // ── Near me ───────────────────────────────────────────────────────────────
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
          const [loc, d] = await Promise.all([
            invoke<GeoLocation>("reverse_geocode", { lat, lng }).catch(() => null),
            invoke<HousingCollection>("fetch_lihtc", { lat, lng, radiusKm: 25 }),
          ]);
          if (loc) setSearchLocation(loc);
          setRawData(normalizeFeatures(d.features, "lihtc"));
          setDataSource("lihtc");
          setHasSearched(true);
          setDataLoading(false);
        } catch {
          setSearchError("Couldn't find homes near your location. Try searching by city name.");
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

  // ── Go home ───────────────────────────────────────────────────────────────
  // handleGoHome defined after searchQuery state exists
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

  // ── Favorites ─────────────────────────────────────────────────────────────
  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("housing-favorites-v2", JSON.stringify([...next]));
      return next;
    });
  }, []);

  // ── App status tracking ───────────────────────────────────────────────────
  const handleStatusChange = useCallback((id: string, status: AppStatusValue | null) => {
    setAppStatuses(prev => {
      const next = { ...prev };
      if (status === null) {
        delete next[id];
      } else {
        next[id] = status;
      }
      try { localStorage.setItem("housing-app-status-v1", JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }, []);

  // ── Survey ────────────────────────────────────────────────────────────────
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
    try { localStorage.setItem("housing-survey-v1", "skipped"); } catch { /* */ }
  }, []);

  // ── AMI for current location ──────────────────────────────────────────────
  const ami = useMemo(() => {
    if (!searchLocation) return 97800;
    const city = searchLocation.display_name.split(",")[0];
    const state = rawData[0]?.state ?? "CA";
    return getAmi(state, city);
  }, [searchLocation, rawData]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo<DisplayProperty[]>(() => {
    let items = rawData;

    if (filters.activeOnly && dataSource === "sj") {
      items = items.filter(p => p.arstatus === "Active");
    }

    // Filter out LIHTC properties whose 30-year affordability period has likely ended
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

    // P0 fix: apply previously-dead filters
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

    const dist = (p: DisplayProperty) =>
      userLocation && p.lat != null && p.lng != null
        ? haversineKm(userLocation.lat, userLocation.lng, p.lat, p.lng)
        : Infinity;

    // P0 fix: implement proper sortBy
    return [...items].sort((a, b) => {
      switch (filters.sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "distance":
          return dist(a) - dist(b);
        case "units":
          return (b.affordableUnits || 0) - (a.affordableUnits || 0);
        case "rent":
          return (a.incomeCeilingPct ?? 999) - (b.incomeCeilingPct ?? 999);
        case "match": {
          // Qualified first (if income set), then by distance
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

  // ── Map GeoJSON ───────────────────────────────────────────────────────────
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
        />

        {/* Map view (toggled) */}
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

        {/* Card grid + detail panel */}
        <div className={`content-area${selectedProperty ? " has-detail" : ""}`}>
          {/* Left: card grid or welcome/empty */}
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
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right: detail panel */}
          {selectedProperty && (
            <DetailPanel
              property={selectedProperty}
              userLocation={userLocation}
              ami={ami}
              userIncome={incomeValue}
              userHhSize={hhSize}
              saved={favorites.has(selectedProperty.id)}
              appStatus={appStatuses[selectedProperty.id]}
              onClose={() => setSelectedProperty(null)}
              onSave={toggleFavorite}
              onStatusChange={handleStatusChange}
            />
          )}
        </div>
      </div>
    </>
  );
}
