import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { HousingCollection } from "../types/housing";

const TILE_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SOURCE_ID = "housing-simple";

interface SimpleMapProps {
  lat: number;
  lng: number;
  data: HousingCollection;
  selectedId?: string | null;
}

export function SimpleMap({ lat, lng, data }: SimpleMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: TILE_STYLE,
      center: [lng, lat],
      zoom: 14,
      interactive: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      loadedRef.current = true;

      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: data as GeoJSON.FeatureCollection,
      });

      map.addLayer({
        id: "simple-pin-halo",
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-radius": 22,
          "circle-color": "oklch(60% 0.17 145)",
          "circle-opacity": 0.18,
          "circle-stroke-width": 0,
        },
      });

      map.addLayer({
        id: "simple-pin",
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-radius": 10,
          "circle-color": "oklch(60% 0.17 145)",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#fff",
          "circle-opacity": 1,
        },
      });
    });

    return () => {
      loadedRef.current = false;
      map.remove();
    };

  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%" }}
      aria-label="Property location map"
      role="img"
    />
  );
}
