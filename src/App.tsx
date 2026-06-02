import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SidePanel } from "./components/SidePanel";
const Map = lazy(() => import("./components/Map").then(m => ({ default: m.Map })));
import type { HousingCollection, GeoLocation, DisplayProperty, MarketData, FmrData, AcsRentData, IlData, RentcastListing } from "./types/housing";
import { normalizeFeatures, hasBedroomType, popMatches, qualifiesForIncome } from "./lib/normalize";
import { haversineKm } from "./lib/geo";
import { getAmi, rentRangeForTier } from "./lib/ami";

export interface FilterState {
  activeOnly: boolean;
  populationType: string;
  incomeTier: "" | "ELI" | "VLI" | "LI" | "Moderate";
  bedroomSize: "" | "0" | "1" | "2" | "3" | "4";
  voucherOnly: boolean;
  sortBy: "name" | "units" | "distance" | "rent";
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
  sortBy: "name",
  householdIncome: 0,
  householdSize: 1,
};

export default function App() {
  const [rawData, setRawData] = useState<DisplayProperty[]>([]);
  const [dataSource, setDataSource] = useState<"sj" | "lihtc">("sj");
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchLocation, setSearchLocation] = useState<GeoLocation | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selected, setSelected] = useState<DisplayProperty | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [mapFly, setMapFly] = useState<{ lat: number; lng: number; zoom: number; bbox?: [number, number, number, number] } | null>(null);

  const [panelOpen, setPanelOpen] = useState(true);
  const exportToastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exportDone, setExportDone] = useState(false);
  const lastSearchRef = useRef<number>(0);
  const searchCounterRef = useRef<number>(0);

  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("housing-favorites-v2");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });

  const [applicationStatuses, setApplicationStatuses] = useState<AppStatuses>(() => {
    try {
      const raw = localStorage.getItem("housing-app-statuses-v1");
      return raw ? JSON.parse(raw) as AppStatuses : {};
    } catch { return {}; }
  });

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const marketCacheRef = useRef<Record<string, MarketData>>({});

  const setAppStatus = useCallback((id: string, status: AppStatusValue | null) => {
    setApplicationStatuses(prev => {
      const next = { ...prev };
      if (status === null) delete next[id];
      else next[id] = status;
      localStorage.setItem("housing-app-statuses-v1", JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Market data fetch on property select ─────────────────────────────────
  useEffect(() => {
    if (!selected?.zip) { setMarketData(null); return; }
    const zip = selected.zip.replace(/\D/g, "").slice(0, 5);
    if (zip.length !== 5) { setMarketData(null); return; }

    if (marketCacheRef.current[zip]) {
      setMarketData(marketCacheRef.current[zip]);
      return;
    }

    let cancelled = false;
    const lat = selected.lat ?? null;
    const lng = selected.lng ?? null;

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
  }, [selected?.zip]);

  // ── City / ZIP search ────────────────────────────────────────────────────
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
    setSelected(null);

    try {
      const loc = await invoke<GeoLocation>("geocode", { query });
      if (myCount !== searchCounterRef.current) return;

      setSearchLocation(loc);
      setMapFly({
        lat: loc.lat, lng: loc.lng, zoom: 12,
        bbox: loc.bbox as [number, number, number, number],
      });

      const cityPart = loc.display_name.split(",")[0].trim().toLowerCase();
      const displayLower = loc.display_name.toLowerCase();
      const isSJ = cityPart === "san jose"
        && (displayLower.includes("california") || displayLower.includes(", ca,") || displayLower.includes(", ca "));

      setDataLoading(true);
      setDataError(null);

      if (isSJ) {
        const d = await invoke<HousingCollection>("fetch_housing");
        if (myCount !== searchCounterRef.current) return;
        setRawData(normalizeFeatures(d.features, "sj"));
        setDataSource("sj");
        setFilters(f => ({ ...f, activeOnly: true }));
      } else {
        const d = await invoke<HousingCollection>("fetch_lihtc", {
          lat: loc.lat, lng: loc.lng, radiusKm: 25,
        });
        if (myCount !== searchCounterRef.current) return;
        setRawData(normalizeFeatures(d.features, "lihtc"));
        setDataSource("lihtc");
        setFilters(f => ({ ...f, activeOnly: false, incomeTier: "", voucherOnly: false }));
      }

      setHasSearched(true);
      setDataLoading(false);
    } catch (e) {
      if (myCount !== searchCounterRef.current) return;
      const msg = typeof e === "string" ? e : JSON.stringify(e);
      if (msg.includes("Not found") || msg.includes("No results")) {
        setSearchError(`No results for "${query}". Try a different city or ZIP code.`);
      } else {
        setSearchError("Search failed. Check your connection and try again.");
      }
      setHasSearched(true); // show empty state, not welcome
      setSearchLoading(false);
      setDataLoading(false);
      return;
    }
    if (myCount !== searchCounterRef.current) return;
    setSearchLoading(false);
  }, []);

  const handleWidenSearch = useCallback(async () => {
    if (!searchLocation) return;
    setDataLoading(true);
    setDataError(null);
    try {
      const d = await invoke<HousingCollection>("fetch_lihtc", {
        lat: searchLocation.lat, lng: searchLocation.lng, radiusKm: 60,
      });
      setRawData(normalizeFeatures(d.features, "lihtc"));
      setDataSource("lihtc");
      setDataLoading(false);
    } catch (e) {
      setDataError(typeof e === "string" ? e : "Failed to load housing data. Try again.");
      setDataLoading(false);
    }
  }, [searchLocation]);

  // ── Near me: geolocate immediately, then fetch LIHTC ────────────────────
  const handleNearMe = useCallback(() => {
    if (!navigator.geolocation) {
      setSearchError("Geolocation is not supported by your browser.");
      return;
    }
    // Set loading immediately — before the geolocation callback fires
    setDataLoading(true);
    setDataError(null);
    setSearchError(null);
    setSelected(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation({ lat, lng });
        setFilters(f => ({ ...f, sortBy: "distance" }));
        setMapFly({ lat, lng, zoom: 12 });

        try {
          const [loc, d] = await Promise.all([
            invoke<GeoLocation>("reverse_geocode", { lat, lng }).catch(() => null),
            invoke<HousingCollection>("fetch_lihtc", { lat, lng, radiusKm: 25 }),
          ]);
          if (loc) setSearchLocation(loc);
          setRawData(normalizeFeatures(d.features, "lihtc"));
          setDataSource("lihtc");
          setFilters(f => ({ ...f, activeOnly: false, incomeTier: "", voucherOnly: false }));
          setHasSearched(true);
          setDataLoading(false);
        } catch (e) {
          setDataError("Failed to load housing data near your location. Try searching by city name.");
          setDataLoading(false);
          setHasSearched(true);
        }
      },
      (err) => {
        setDataLoading(false);
        const msg =
          err.code === 1 ? "Location access denied. Please allow location access or search by city name." :
          err.code === 3 ? "Location request timed out. Try again or search by city." :
          "Could not get your location. Search by city name instead.";
        setSearchError(msg);
      },
      { enableHighAccuracy: true, timeout: 8500 }
    );
  }, []);

  // ── Clear search → welcome state ─────────────────────────────────────────
  const handleGoHome = useCallback(() => {
    setRawData([]);
    setDataSource("sj");
    setSearchQuery("");
    setSearchLocation(null);
    setSelected(null);
    setHasSearched(false);
    setFilters(DEFAULT_FILTERS);
    setDataError(null);
    setSearchError(null);
  }, []);

  // ── Favorites ────────────────────────────────────────────────────────────
  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("housing-favorites-v2", JSON.stringify([...next]));
      return next;
    });
  }, []);

  // ── AMI for current location ─────────────────────────────────────────────
  const ami = useMemo(() => {
    if (!searchLocation) return 97800; // national median fallback
    const city = searchLocation.display_name.split(",")[0];
    const state = rawData[0]?.state ?? "CA";
    return getAmi(state, city);
  }, [searchLocation, rawData]);

  // ── Filtered + sorted list ───────────────────────────────────────────────
  const filtered = useMemo<DisplayProperty[]>(() => {
    let items = rawData;

    if (filters.activeOnly && dataSource === "sj") {
      items = items.filter(p => p.arstatus === "Active");
    }
    if (filters.populationType) {
      items = items.filter(p => popMatches(p, filters.populationType));
    }
    if (filters.bedroomSize) {
      items = items.filter(p => hasBedroomType(p, filters.bedroomSize));
    }
    if (filters.voucherOnly) {
      items = items.filter(p => p.hasRentalAssistance);
    }
    if (filters.incomeTier) {
      const tierCeiling = { ELI: 30, VLI: 50, LI: 80, Moderate: 120 }[filters.incomeTier] ?? 0;
      if (dataSource === "sj") {
        items = items.filter(p => {
          if (filters.incomeTier === "ELI")      return (p.eliunits ?? 0) > 0;
          if (filters.incomeTier === "VLI")      return (p.vliunits ?? 0) > 0;
          if (filters.incomeTier === "LI")       return (p.liunits ?? 0) > 0;
          if (filters.incomeTier === "Moderate") return (p.moderateunits ?? 0) > 0;
          return true;
        });
      } else {
        items = items.filter(p => !p.incomeCeilingPct || p.incomeCeilingPct <= tierCeiling);
      }
    }

    if (filters.householdIncome > 0) {
      items = items.filter(p => qualifiesForIncome(p, filters.householdIncome, filters.householdSize, ami));
    }

    return [...items].sort((a, b) => {
      if (filters.sortBy === "units") return b.affordableUnits - a.affordableUnits;
      if (filters.sortBy === "distance" && userLocation) {
        const dA = a.lat != null && a.lng != null
          ? haversineKm(userLocation.lat, userLocation.lng, a.lat, a.lng) : Infinity;
        const dB = b.lat != null && b.lng != null
          ? haversineKm(userLocation.lat, userLocation.lng, b.lat, b.lng) : Infinity;
        return dA - dB;
      }
      if (filters.sortBy === "rent") {
        const estRent = (p: DisplayProperty): number => {
          if (p.source === "lihtc" && p.incomeCeilingPct) {
            const r = rentRangeForTier(p.incomeCeilingPct, ami);
            if (filters.bedroomSize === "0") return r.studio;
            if (filters.bedroomSize === "1") return r.oneBed;
            if (filters.bedroomSize === "2") return r.twoBed;
            if (filters.bedroomSize === "3") return r.threeBed;
            const b = p.bedrooms;
            if (b.studio > 0) return r.studio;
            if (b.br1 > 0) return r.oneBed;
            if (b.br2 > 0) return r.twoBed;
            return r.threeBed;
          }
          if (p.source === "sj") {
            const tier = (p.eliunits ?? 0) > 0 ? "ELI"
              : (p.vliunits ?? 0) > 0 ? "VLI"
              : (p.liunits ?? 0) > 0 ? "LI" : "Moderate";
            return rentRangeForTier(tier, ami).studio;
          }
          return Infinity;
        };
        return estRent(a) - estRent(b);
      }
      return a.name.localeCompare(b.name);
    });
  }, [rawData, filters, userLocation, dataSource, ami]);

  // ── Map GeoJSON ──────────────────────────────────────────────────────────
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

  const handleSelectFromMap = useCallback((rawProps: Record<string, unknown>) => {
    const id = String(rawProps._displayId ?? "");
    const found = filtered.find(p => p.id === id) ?? rawData.find(p => p.id === id);
    if (found) setSelected(found);
  }, [filtered, rawData]);

  const handleLocate = useCallback((loc: UserLocation) => {
    setUserLocation(loc);
    setFilters(f => ({ ...f, sortBy: "distance" }));
  }, []);

  const handleExportFavorites = useCallback(() => {
    const favs = rawData.filter(p => favorites.has(p.id));
    if (!favs.length) return;
    const lines = favs.map(p => {
      const status = applicationStatuses[p.id];
      return [
        p.name,
        `${p.address}, ${p.city}, ${p.state} ${p.zip}`.trim().replace(/,\s*,/g, ","),
        p.phone ? `Phone: ${p.phone}` : "",
        p.website ? `Website: ${p.website}` : "",
        p.affordableUnits ? `${p.affordableUnits} affordable units` : "",
        status ? `Status: ${status}` : "",
      ].filter(Boolean).join("\n");
    });
    const blob = new Blob([lines.join("\n\n---\n\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "saved-housing.txt";
    a.click();
    URL.revokeObjectURL(a.href);
    if (exportToastRef.current) clearTimeout(exportToastRef.current);
    setExportDone(true);
    exportToastRef.current = setTimeout(() => setExportDone(false), 2500);
  }, [rawData, favorites, applicationStatuses]);

  const loading = dataLoading || searchLoading;
  const error = dataError || searchError;

  return (
    <div className={`app-layout${panelOpen ? "" : " panel-hidden"}`}>
      <SidePanel
        properties={filtered}
        totalCount={rawData.length}
        selected={selected}
        loading={loading}
        error={error}
        filters={filters}
        setFilters={setFilters}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        userLocation={userLocation}
        onSelect={(p) => { setSelected(p); setPanelOpen(true); }}
        onClear={() => setSelected(null)}
        onRetry={searchQuery ? () => handleSearch(searchQuery) : handleGoHome}
        onSearch={handleSearch}
        onWidenSearch={searchLocation && dataSource !== "sj" ? handleWidenSearch : undefined}
        onGoHome={hasSearched ? handleGoHome : undefined}
        onExportFavorites={handleExportFavorites}
        onNearMe={handleNearMe}
        dataSource={dataSource}
        ami={ami}
        searchDisplay={searchLocation?.display_name}
        hasSearched={hasSearched}
        applicationStatuses={applicationStatuses}
        onSetAppStatus={setAppStatus}
        marketData={marketData}
      />
      <div className="map-container">
        <Suspense fallback={<div style={{ width: "100%", height: "100%", background: "var(--bg-deep)" }} />}>
          <Map
            data={mapData}
            userLocation={userLocation}
            mapFly={mapFly}
            dataSource={dataSource}
            selectedId={selected?.id ?? null}
            onSelectFeature={(props) => { handleSelectFromMap(props); setPanelOpen(true); }}
            onLocate={handleLocate}
          />
        </Suspense>
        <button
          className="panel-toggle-btn"
          onClick={() => setPanelOpen(v => !v)}
          aria-label={panelOpen ? "Hide panel" : "Show panel"}
          title={panelOpen ? "Hide panel" : "Show panel"}
        >
          {panelOpen ? "◀" : "▶"}
        </button>
        <div className="map-legend" aria-label="Map legend">
          <div className="legend-item">
            <span className="legend-dot legend-cluster" aria-hidden="true" />
            <span>Cluster</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot legend-selected" aria-hidden="true" />
            <span>Selected</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot legend-active" aria-hidden="true" />
            <span>{dataSource === "sj" ? "SJ Active" : "LIHTC"}</span>
          </div>
          <div className="legend-source" aria-label="Data source">
            {dataSource === "sj" ? "City of San Jose" : "HUD LIHTC 2024"}
          </div>
        </div>
        {exportDone && (
          <div className="export-toast" role="status" aria-live="polite">
            ✓ Saved to file
          </div>
        )}
      </div>
    </div>
  );
}
