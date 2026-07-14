import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { Crosshair, MapPin, Navigation, Search } from 'lucide-react';
import { LocalPlace, MapPack, PhotoAsset } from '../../../shared/types';

let protocolRegistered = false;

interface MapPanelProps {
  activeMapPackId?: string;
  mapPacks: MapPack[];
  tileServerUrl?: string;
  selectedAsset?: PhotoAsset;
  onApplyLocation(latitude: number, longitude: number): Promise<void>;
}

export function MapPanel({
  activeMapPackId,
  mapPacks,
  tileServerUrl,
  selectedAsset,
  onApplyLocation
}: MapPanelProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [pin, setPin] = useState(() => initialPin(selectedAsset));
  const [placeQuery, setPlaceQuery] = useState('');
  const [places, setPlaces] = useState<LocalPlace[]>([]);

  const activeMapPack = useMemo(
    () => mapPacks.find((pack) => pack.id === activeMapPackId && pack.kind === 'pmtiles'),
    [activeMapPackId, mapPacks]
  );

  useEffect(() => {
    if (!protocolRegistered) {
      const protocol = new Protocol();
      maplibregl.addProtocol('pmtiles', protocol.tile);
      protocolRegistered = true;
    }
  }, []);

  useEffect(() => {
    setPin(initialPin(selectedAsset));
  }, [selectedAsset?.id]);

  useEffect(() => {
    if (!containerRef.current || !activeMapPack || !tileServerUrl) return;

    mapRef.current?.remove();
    markerRef.current = null;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(`${tileServerUrl}/pmtiles/${encodeURIComponent(activeMapPack.id)}`),
      center: pin ? [pin.longitude, pin.latitude] : [-98.5795, 39.8283],
      zoom: pin ? 10 : 3,
      attributionControl: false
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('click', (event) => setPin({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [activeMapPack?.id, tileServerUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pin) return;

    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ color: '#b42318', draggable: true })
        .setLngLat([pin.longitude, pin.latitude])
        .addTo(map);
      markerRef.current.on('dragend', () => {
        const position = markerRef.current!.getLngLat();
        setPin({ latitude: position.lat, longitude: position.lng });
      });
    } else {
      markerRef.current.setLngLat([pin.longitude, pin.latitude]);
    }
  }, [pin]);

  async function searchPlaces(): Promise<void> {
    const results = await window.photoMeta.searchPlaces(placeQuery);
    setPlaces(results);
  }

  function moveTo(latitude: number, longitude: number): void {
    setPin({ latitude, longitude });
    mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 12 });
  }

  if (!activeMapPack || !tileServerUrl) {
    return (
      <div className="map-empty">
        <MapPin size={30} />
        <div className="coordinate-entry">
          <input
            placeholder="Latitude"
            value={pin?.latitude ?? ''}
            onChange={(event) => setPin({ latitude: Number(event.target.value), longitude: pin?.longitude ?? 0 })}
          />
          <input
            placeholder="Longitude"
            value={pin?.longitude ?? ''}
            onChange={(event) => setPin({ latitude: pin?.latitude ?? 0, longitude: Number(event.target.value) })}
          />
          <button disabled={!pin} onClick={() => pin && onApplyLocation(pin.latitude, pin.longitude)}>
            Apply
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="map-panel">
      <div className="place-search">
        <Search size={15} />
        <input value={placeQuery} onChange={(event) => setPlaceQuery(event.target.value)} placeholder="Offline place search" />
        <button onClick={searchPlaces}>Find</button>
      </div>
      {places.length > 0 && (
        <div className="place-results">
          {places.map((place) => (
            <button key={`${place.id}-${place.latitude}-${place.longitude}`} onClick={() => moveTo(place.latitude, place.longitude)}>
              <span>{place.name}</span>
              <small>{[place.region, place.country].filter(Boolean).join(', ')}</small>
            </button>
          ))}
        </div>
      )}
      <div ref={containerRef} className="map-canvas" />
      <div className="map-footer">
        <span>
          <Crosshair size={15} />
          {pin ? `${pin.latitude.toFixed(6)}, ${pin.longitude.toFixed(6)}` : 'No pin'}
        </span>
        <button disabled={!pin} onClick={() => pin && onApplyLocation(pin.latitude, pin.longitude)}>
          <Navigation size={15} /> Apply Pin
        </button>
      </div>
    </div>
  );
}

function initialPin(asset?: PhotoAsset): { latitude: number; longitude: number } | undefined {
  if (asset?.effective.latitude === undefined || asset.effective.longitude === undefined) return undefined;
  return { latitude: asset.effective.latitude, longitude: asset.effective.longitude };
}

function buildStyle(pmtilesUrl: string): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      offline: {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`
      }
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#ede9dd' } },
      {
        id: 'earth',
        type: 'fill',
        source: 'offline',
        'source-layer': 'earth',
        paint: { 'fill-color': '#e7dfca' }
      },
      {
        id: 'landuse',
        type: 'fill',
        source: 'offline',
        'source-layer': 'landuse',
        paint: { 'fill-color': '#d6e3c5', 'fill-opacity': 0.55 }
      },
      {
        id: 'water',
        type: 'fill',
        source: 'offline',
        'source-layer': 'water',
        paint: { 'fill-color': '#9cc9d4' }
      },
      {
        id: 'roads-minor',
        type: 'line',
        source: 'offline',
        'source-layer': 'roads',
        paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.2, 12, 2.2] }
      },
      {
        id: 'roads-major',
        type: 'line',
        source: 'offline',
        'source-layer': 'roads',
        filter: ['in', ['get', 'kind'], ['literal', ['highway', 'major_road']]],
        paint: { 'line-color': '#d79f47', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 12, 4] }
      },
      {
        id: 'buildings',
        type: 'fill',
        source: 'offline',
        'source-layer': 'buildings',
        minzoom: 13,
        paint: { 'fill-color': '#c9bdab', 'fill-opacity': 0.65 }
      }
    ]
  };
}

