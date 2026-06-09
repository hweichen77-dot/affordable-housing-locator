import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { HousingCollection } from "../types/housing";
import type { UserLocation } from "../App";

const TILE_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SJ_CENTER: [number, number] = [-121.8863, 37.3382];

interface MapFly {
  lat: number;
  lng: number;
  zoom: number;
  bbox?: [number, number, number, number]; // south, north, west, east
}

interface MapProps {
  data: HousingCollection;
  userLocation: UserLocation | null;
  mapFly: MapFly | null;
  dataSource: "sj" | "lihtc";
  selectedId: string | null;
  onSelectFeature: (props: Record<string, unknown>) => void;
  onLocate: (loc: UserLocation) => void;
}

const SOURCE_ID = "housing";

export function Map({ data, userLocation, mapFly, dataSource, selectedId, onSelectFeature, onLocate }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelectFeature);
  const styleLoadedRef = useRef(false);
  const pendingDataRef = useRef<HousingCollection | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => { onSelectRef.current = onSelectFeature; }, [onSelectFeature]);

  // Init map once
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: TILE_STYLE,
      center: SJ_CENTER,
      zoom: 11,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl(), "bottom-right");

    map.on("load", () => {
      styleLoadedRef.current = true;
      // Flush any data that arrived before style was ready
      if (pendingDataRef.current) {
        addOrUpdateSource(map, pendingDataRef.current);
        pendingDataRef.current = null;
      }
      addMapLayers(map, onSelectRef, popupRef);
    });

    return () => {
      styleLoadedRef.current = false;
      popupRef.current?.remove();
      userMarkerRef.current?.remove();
      map.remove();
    };
  }, []);

  // Handle fly-to / fit-bounds when search changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapFly) return;
    if (mapFly.bbox) {
      const [s, n, w, e] = mapFly.bbox;
      // Sanity check: bbox must not be degenerate
      if (n - s > 0.001 && e - w > 0.001) {
        map.fitBounds([[w, s], [e, n]], { padding: 40, maxZoom: 14, duration: 900 });
        return;
      }
    }
    map.flyTo({ center: [mapFly.lng, mapFly.lat], zoom: mapFly.zoom, duration: 900 });
  }, [mapFly]);

  // User location marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;
    userMarkerRef.current?.remove();
    const el = document.createElement("div");
    el.className = "user-location-marker";
    el.setAttribute("aria-label", "Your location");
    userMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map);
    map.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 13, duration: 1200 });
  }, [userLocation]);

  // Data update — handles race with style load
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!styleLoadedRef.current) {
      pendingDataRef.current = data;
      return;
    }
    addOrUpdateSource(map, data);
  }, [data]);

  // Highlight selected pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    if (!map.getLayer("housing-selected")) return;
    map.setFilter("housing-selected", [
      "==", ["get", "_displayId"], selectedId ?? "",
    ]);
  }, [selectedId]);

  const handleLocate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onLocate({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} aria-label="Housing map" role="region" />
      <button
        className={`locate-btn ${locating ? "locating" : ""}`}
        onClick={handleLocate}
        title="Find housing near me"
        aria-label="Find housing near my location"
        disabled={locating}
      >{locating ? "…" : "⊙"}</button>
      <div className="map-source-badge" aria-label={`Data source: ${dataSource === "sj" ? "San Jose local data" : "HUD LIHTC nationwide"}`}>
        {dataSource === "sj" ? "SJ Local" : "HUD LIHTC Nationwide"}
      </div>
    </div>
  );
}

function addOrUpdateSource(map: maplibregl.Map, data: HousingCollection) {
  const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (src) {
    src.setData(data as GeoJSON.FeatureCollection);
  } else {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: data as GeoJSON.FeatureCollection,
    });
  }
}

function addMapLayers(map: maplibregl.Map, onSelectRef: React.MutableRefObject<(props: Record<string, unknown>) => void>, popupRef: React.MutableRefObject<maplibregl.Popup | null>) {
  if (map.getLayer("housing-heat")) return;

  // Heatmap — visible at low zoom, fades out as user zooms in
  map.addLayer({
    id: "housing-heat",
    type: "heatmap",
    source: SOURCE_ID,
    maxzoom: 13,
    paint: {
      "heatmap-weight": 1,
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 12, 3],
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0,   "rgba(0,0,0,0)",
        0.2, "rgba(74,222,128,0.25)",
        0.5, "rgba(34,197,94,0.6)",
        0.8, "rgba(22,163,74,0.85)",
        1.0, "rgba(21,128,61,0.95)",
      ],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 6, 12, 24],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 10, 1, 13, 0],
    },
  });

  // Individual pins — fade in as zoom increases
  map.addLayer({
    id: "housing-points",
    type: "circle",
    source: SOURCE_ID,
    minzoom: 10,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 14, 9],
      "circle-color": [
        "case",
        ["==", ["get", "ARSTATUS"], "Active"], "#16a34a",
        "#3b82f6",
      ],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0, 12, 0.9],
    },
  });

  map.addLayer({
    id: "housing-selected",
    type: "circle",
    source: SOURCE_ID,
    filter: ["==", ["get", "_displayId"], ""],
    paint: {
      "circle-radius": 13,
      "circle-color": "#f59e0b",
      "circle-stroke-width": 3,
      "circle-stroke-color": "#fff",
      "circle-opacity": 1,
    },
  });

  map.on("click", "housing-points", (e) => {
    const feature = e.features?.[0];
    if (!feature?.properties || !feature.geometry) return;
    const props = feature.properties as Record<string, unknown>;
    const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
    popupRef.current?.remove();
    popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: "280px", offset: 12 })
      .setLngLat(coords)
      .setHTML(buildPopupHTML(props))
      .addTo(map);
    onSelectRef.current(props);
  });

  map.on("mouseenter", "housing-points", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "housing-points", () => { map.getCanvas().style.cursor = ""; });

  map.getCanvas().setAttribute("tabindex", "0");
  map.getCanvas().setAttribute("aria-label", "Interactive housing map. Use arrow keys to pan, +/- to zoom.");
}

function affordabilityLabel(incCeil: number | undefined): string {
  if (!incCeil) return "Income-assisted housing";
  if (incCeil <= 30) return "Very Affordable";
  if (incCeil <= 50) return "Affordable";
  if (incCeil <= 80) return "Good Fit";
  return "Moderately Assisted";
}

function buildPopupHTML(p: Record<string, unknown>): string {
  const name = String(p.PROJECT ?? p.DEVELOPMENTNAME ?? "Housing Property");
  const addr = [String(p.PROJ_ADD ?? p.ADDRESS ?? ""), String(p.PROJ_CTY ?? p.CITY ?? "")]
    .filter(s => s && s !== "undefined").join(", ");
  const units = Number(p.LI_UNITS ?? p.TOTALAFFUNITS ?? 0);
  const phone = String(p.CO_TEL ?? p.PHONE ?? "");
  const arstatus = String(p.ARSTATUS ?? "");
  const incCeil = p.INC_CEIL ? Number(p.INC_CEIL) : undefined;
  const tierLabel = arstatus === "Active" ? "● Available now" : affordabilityLabel(incCeil);

  return `<div class="popup-content">
    <strong class="popup-name">${escHtml(name)}</strong>
    <div class="popup-tier">${escHtml(tierLabel)}</div>
    ${addr ? `<div class="popup-addr">${escHtml(addr)}</div>` : ""}
    ${units > 0 ? `<div class="popup-stat">${units} income-restricted home${units !== 1 ? "s" : ""}</div>` : ""}
    ${phone ? `<a class="popup-phone" href="tel:${escAttr(phone.replace(/\s/g, ""))}">${escHtml(phone)}</a>` : ""}
    <div class="popup-cta">Tap to see details →</div>
  </div>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escAttr(s: string): string {
  return s.replace(/"/g, "%22").replace(/'/g, "%27");
}
