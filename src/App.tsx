import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Map } from "./components/Map";
import { SidePanel } from "./components/SidePanel";
import type { HousingCollection, GeoLocation, DisplayProperty } from "./types/housing";
import { normalizeFeatures, hasBedroomType, popMatches } from "./lib/normalize";
import { getAmi } from "./lib/ami";

export interface FilterState {
  activeOnly: boolean;
  populationType: string;
  incomeTier: "" | "ELI" | "VLI" | "LI" | "Moderate";
  bedroomSize: "" | "0" | "1" | "2" | "3" | "4";
  voucherOnly: boolean;
  sortBy: "name" | "units" | "distance";
  householdIncome: number;
  householdSize: number;
}

export interface UserLocation { lng: number; lat: number; }

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

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function App() {
  const [rawData, setRawData] = useState<DisplayProperty[]>([]);
  const [dataSource, setDataSource] = useState<"sj" | "lihtc">("sj");
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchLocation, setSearchLocation] = useState<GeoLocation | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selected, setSelected] = useState<DisplayProperty | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [mapFly, setMapFly] = useState<{ lat: number; lng: number; zoom: number; bbox?: [number, number, number, number] } | null>(null);

  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("housing-favorites-v2");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // ── Initial SJ data load ─────────────────────────────────────────────────
  const loadSJ = useCallback(() => {
    setDataLoading(true);
    setDataError(null);
    invoke<HousingCollection>("fetch_housing")
      .then((d) => {
        setRawData(normalizeFeatures(d.features, "sj"));
        setDataSource("sj");
        setDataLoading(false);
      })
      .catch((e) => {
        setDataError(typeof e === "string" ? e : JSON.stringify(e));
        setDataLoading(false);
      });
  }, []);

  useEffect(() => { loadSJ(); }, [loadSJ]);

  // ── City / ZIP search ────────────────────────────────────────────────────
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setSearchQuery(query);
    setSearchError(null);
    setSearchLoading(true);
    setSelected(null);

    try {
      const loc = await invoke<GeoLocation>("geocode", { query });
      setSearchLocation(loc);
      setMapFly({
        lat: loc.lat, lng: loc.lng, zoom: 12,
        bbox: loc.bbox as [number, number, number, number],
      });

      const isSJ = loc.display_name.toLowerCase().includes("san jose")
        && loc.display_name.toLowerCase().includes("california");

      setDataLoading(true);
      setDataError(null);

      if (isSJ) {
        const d = await invoke<HousingCollection>("fetch_housing");
        setRawData(normalizeFeatures(d.features, "sj"));
        setDataSource("sj");
        setFilters(f => ({ ...f, activeOnly: true }));
      } else {
        const d = await invoke<HousingCollection>("fetch_lihtc", {
          lat: loc.lat, lng: loc.lng, radiusKm: 15,
        });
        setRawData(normalizeFeatures(d.features, "lihtc"));
        setDataSource("lihtc");
        setFilters(f => ({ ...f, activeOnly: false, incomeTier: "", voucherOnly: false }));
      }

      setDataLoading(false);
    } catch (e) {
      const msg = typeof e === "string" ? e : JSON.stringify(e);
      if (msg.includes("Not found") || msg.includes("No results")) {
        setSearchError(`No results for "${query}". Try a different city or ZIP.`);
      } else {
        setSearchError(msg);
      }
      setSearchLoading(false);
      setDataLoading(false);
      return;
    }
    setSearchLoading(false);
  }, []);

  const handleWidenSearch = useCallback(async () => {
    if (!searchLocation) return;
    setDataLoading(true);
    setDataError(null);
    try {
      const d = await invoke<HousingCollection>("fetch_lihtc", {
        lat: searchLocation.lat, lng: searchLocation.lng, radiusKm: 40,
      });
      setRawData(normalizeFeatures(d.features, "lihtc"));
      setDataSource("lihtc");
      setDataLoading(false);
    } catch (e) {
      setDataError(typeof e === "string" ? e : JSON.stringify(e));
      setDataLoading(false);
    }
  }, [searchLocation]);

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
    if (!searchLocation) return 169600; // SJ default
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

    return [...items].sort((a, b) => {
      if (filters.sortBy === "units") return b.affordableUnits - a.affordableUnits;
      if (filters.sortBy === "distance" && userLocation) {
        const dA = a.lat != null && a.lng != null
          ? haversineKm(userLocation.lat, userLocation.lng, a.lat, a.lng) : Infinity;
        const dB = b.lat != null && b.lng != null
          ? haversineKm(userLocation.lat, userLocation.lng, b.lat, b.lng) : Infinity;
        return dA - dB;
      }
      return a.name.localeCompare(b.name);
    });
  }, [rawData, filters, userLocation, dataSource]);

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
    const lines = favs.map(p => [
      p.name,
      `${p.address}, ${p.city}, ${p.state} ${p.zip}`.trim().replace(/,\s*,/g, ","),
      p.phone ? `Phone: ${p.phone}` : "",
      p.website ? `Website: ${p.website}` : "",
      p.affordableUnits ? `${p.affordableUnits} affordable units` : "",
    ].filter(Boolean).join("\n"));
    const blob = new Blob([lines.join("\n\n---\n\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "saved-housing.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }, [rawData, favorites]);

  const loading = dataLoading || searchLoading;
  const error = dataError || searchError;

  return (
    <div className="app-layout">
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
        onSelect={setSelected}
        onClear={() => setSelected(null)}
        onRetry={searchQuery ? () => handleSearch(searchQuery) : loadSJ}
        onSearch={handleSearch}
        onWidenSearch={searchLocation ? handleWidenSearch : undefined}
        onExportFavorites={handleExportFavorites}
        dataSource={dataSource}
        ami={ami}
        searchDisplay={searchLocation?.display_name}
      />
      <div className="map-container">
        <Map
          data={mapData}
          userLocation={userLocation}
          mapFly={mapFly}
          dataSource={dataSource}
          onSelectFeature={handleSelectFromMap}
          onLocate={handleLocate}
        />
        <div className="map-legend" aria-label="Map legend">
          <div className="legend-item">
            <span className="legend-dot legend-cluster" aria-hidden="true" />
            <span>Cluster</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot legend-active" aria-hidden="true" />
            <span>{dataSource === "sj" ? "Active" : "LIHTC"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
