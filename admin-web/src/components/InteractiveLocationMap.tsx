import { createElement, useEffect, useId, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

const VALENCIA_DEFAULT = {
  latitude: 9.2805,
  longitude: 123.2431,
};

/** Same Google Maps key used by the citizen mobile app (ecobantay_app/app.json). */
const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
  "AIzaSyBK-t1HyWS40z-Y18sT4OWuPWcY7gt-Dhw";

type Coordinates = { latitude: number; longitude: number };

type InteractiveLocationMapProps = {
  coordinates?: Coordinates | null;
  height?: number;
  selectable?: boolean;
  onSelect?: (coordinates: Coordinates) => void;
};

declare global {
  interface Window {
    google?: any;
    __ecobantayMapsReady?: () => void;
  }
}

let googleMapsLoader: Promise<any> | null = null;

/**
 * Purpose: Loads the Google Maps JavaScript API once using the shared EcoBantay Maps key.
 * How it works: Injects the Maps script with the same API key as the mobile app, then resolves google.maps.
 * Technologies Used: Google Maps JavaScript API and browser DOM script loading.
 * Why this implementation: Admin web maps stay aligned with the citizen app provider and API key.
 */
function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps requires a browser environment."));
  }
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (googleMapsLoader) return googleMapsLoader;

  googleMapsLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-ecobantay-maps="true"]');
    if (existing && window.google?.maps) {
      resolve(window.google.maps);
      return;
    }

    window.__ecobantayMapsReady = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error("Google Maps failed to initialize."));
    };

    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}` +
      `&callback=__ecobantayMapsReady`;
    script.async = true;
    script.defer = true;
    script.setAttribute("data-ecobantay-maps", "true");
    script.onerror = () => reject(new Error("Failed to load Google Maps."));
    document.head.appendChild(script);
  });

  return googleMapsLoader;
}

/**
 * Purpose: Renders an interactive Google Map for admin report and event locations.
 * How it works:
 * 1. Uses the same Google Maps API key configured for the citizen app.
 * 2. Supports drag, zoom, and optional pin placement for event creation.
 * 3. Non-web platforms show a readable GPS fallback.
 * Technologies Used: React, React Native Web, and Google Maps JavaScript API.
 * Why this implementation: Shared Maps credentials keep admin and user location tooling consistent without react-native-maps on web.
 */
export default function InteractiveLocationMap({
  coordinates,
  height = 220,
  selectable = false,
  onSelect,
}: InteractiveLocationMapProps) {
  const mapId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const center = coordinates ?? VALENCIA_DEFAULT;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    let cancelled = false;
    let clickListener: any = null;
    let dragListener: any = null;

    const setup = async () => {
      try {
        const maps = await loadGoogleMaps();
        if (cancelled || !containerRef.current) return;

        const nextCenter = { lat: center.latitude, lng: center.longitude };

        if (!mapRef.current) {
          mapRef.current = new maps.Map(containerRef.current, {
            center: nextCenter,
            zoom: 15,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            zoomControl: true,
            gestureHandling: "greedy",
            draggable: true,
            scrollwheel: true,
            disableDoubleClickZoom: false,
          });

          if (selectable) {
            clickListener = mapRef.current.addListener("click", (event: any) => {
              if (!event.latLng) return;
              onSelectRef.current?.({
                latitude: event.latLng.lat(),
                longitude: event.latLng.lng(),
              });
            });
          }
        } else {
          mapRef.current.setCenter(nextCenter);
        }

        if (!markerRef.current) {
          markerRef.current = new maps.Marker({
            position: nextCenter,
            map: mapRef.current,
            draggable: selectable,
          });

          if (selectable) {
            dragListener = markerRef.current.addListener("dragend", () => {
              const position = markerRef.current.getPosition();
              if (!position) return;
              onSelectRef.current?.({
                latitude: position.lat(),
                longitude: position.lng(),
              });
            });
          }
        } else {
          markerRef.current.setPosition(nextCenter);
        }

        maps.event.trigger(mapRef.current, "resize");
        mapRef.current.setCenter(nextCenter);
      } catch {
        // Keep the fallback panel visible when Maps assets cannot load.
      }
    };

    void setup();

    return () => {
      cancelled = true;
      clickListener?.remove?.();
      dragListener?.remove?.();
    };
  }, [center.latitude, center.longitude, selectable]);

  if (Platform.OS !== "web") {
    return (
      <View style={[styles.shell, styles.fallback, { height }]}>
        <Text style={styles.fallbackTitle}>Google Map preview</Text>
        <Text style={styles.fallbackText}>
          {coordinates
            ? `${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`
            : "Open the admin dashboard in a web browser to use the interactive Google Map."}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.shell, { height }]}>
      {createElement("div", {
        id: `admin-google-map-${mapId}`,
        ref: containerRef,
        style: { width: "100%", height: "100%", borderRadius: 8 },
      })}
      {!coordinates ? (
        <Text style={styles.hint}>
          {selectable
            ? "Click or drag the pin to set the event location."
            : "Showing Valencia default Google Map."}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#dce8d5",
    borderWidth: 1,
    borderColor: "#c9d6c5",
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  fallbackTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: "#145b22",
    marginBottom: 6,
  },
  fallbackText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 12,
    color: "#555",
    textAlign: "center",
  },
  hint: {
    position: "absolute",
    left: 8,
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    color: "#444",
    fontFamily: "Montserrat_700Bold",
  },
});
