import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { HousingCollection, HousingProperties } from "../types/housing";

const TILE_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SJ_CENTER: [number, number] = [-121.8863, 37.3382];

interface MapProps {
  data: HousingCollection | null;
  onSelectFeature: (props: HousingProperties) => void;
}

export function Map({ data, onSelectFeature }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: TILE_STYLE,
      center: SJ_CENTER,
      zoom: 12,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl(), "bottom-right");

    return () => map.remove();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;

    const addLayers = () => {
      if (map.getSource("housing")) {
        (map.getSource("housing") as maplibregl.GeoJSONSource).setData(data as GeoJSON.FeatureCollection);
        return;
      }

      map.addSource("housing", {
        type: "geojson",
        data: data as GeoJSON.FeatureCollection,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 40,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "housing",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ["step", ["get", "point_count"], "#2563eb", 10, "#1d4ed8", 30, "#1e40af"],
          "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 30, 30],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
          "circle-opacity": 0.9,
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "housing",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-size": 12,
          "text-font": ["Open Sans Bold"],
        },
        paint: { "text-color": "#fff" },
      });

      map.addLayer({
        id: "housing-points",
        type: "circle",
        source: "housing",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 8,
          "circle-color": "#2563eb",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
          "circle-opacity": 0.9,
        },
      });

      map.on("click", "clusters", (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
        const clusterId = features[0].properties?.cluster_id;
        (map.getSource("housing") as maplibregl.GeoJSONSource).getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || zoom == null) return;
          const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number];
          map.easeTo({ center: coords, zoom });
        });
      });

      map.on("click", "housing-points", (e) => {
        const feature = e.features?.[0];
        if (feature?.properties) {
          onSelectFeature(feature.properties as HousingProperties);
        }
      });

      map.on("mouseenter", "clusters", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "clusters", () => { map.getCanvas().style.cursor = ""; });
      map.on("mouseenter", "housing-points", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "housing-points", () => { map.getCanvas().style.cursor = ""; });
    };

    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      map.on("load", addLayers);
    }
  }, [data, onSelectFeature]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
