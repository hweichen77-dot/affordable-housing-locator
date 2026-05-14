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
  const popupRef = useRef<maplibregl.Popup | null>(null);
  // Ref pattern avoids stale closure in registered map event handlers
  const onSelectRef = useRef(onSelectFeature);
  useEffect(() => { onSelectRef.current = onSelectFeature; }, [onSelectFeature]);

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

    return () => {
      popupRef.current?.remove();
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;

    const addLayers = () => {
      if (map.getSource("housing")) {
        (map.getSource("housing") as maplibregl.GeoJSONSource).setData(
          data as GeoJSON.FeatureCollection
        );
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
          // Fallback glyph required; "Arial Unicode MS Regular" ships with most tile styles
          "text-font": ["Open Sans Bold", "Arial Unicode MS Regular"],
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

      map.on("click", "clusters", async (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
        if (!features.length) return;
        const clusterId = features[0].properties?.cluster_id;
        if (clusterId == null) return;
        const zoom = await (map.getSource("housing") as maplibregl.GeoJSONSource)
          .getClusterExpansionZoom(clusterId);
        const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number];
        map.easeTo({ center: coords, zoom });
      });

      map.on("click", "housing-points", (e) => {
        const feature = e.features?.[0];
        if (!feature?.properties || !feature.geometry) return;

        const props = feature.properties as HousingProperties;
        const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];

        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({
          closeButton: true,
          maxWidth: "240px",
          offset: 12,
        })
          .setLngLat(coords)
          .setHTML(buildPopupHTML(props))
          .addTo(map);

        onSelectRef.current(props);
      });

      map.on("mouseenter", "clusters", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "clusters", () => { map.getCanvas().style.cursor = ""; });
      map.on("mouseenter", "housing-points", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "housing-points", () => { map.getCanvas().style.cursor = ""; });
    };

    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      // 'once' prevents duplicate handler if this effect runs again before style loads
      map.once("load", addLayers);
    }
  }, [data]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

function buildPopupHTML(props: HousingProperties): string {
  const name = String(props.PROJECT_NAME ?? "Unknown Project");
  const addr = props.ADDRESS
    ? `<div class="popup-addr">${String(props.ADDRESS)}</div>`
    : "";
  const units =
    props.TOTAL_UNITS != null
      ? `<div class="popup-stat">${props.TOTAL_UNITS} total &middot; ${props.AFFORDABLE_UNITS ?? "?"} affordable</div>`
      : "";
  const status = props.PROJECT_STATUS
    ? `<div class="popup-status">${String(props.PROJECT_STATUS)}</div>`
    : "";
  return `<div class="popup-content"><strong class="popup-name">${name}</strong>${addr}${units}${status}</div>`;
}
