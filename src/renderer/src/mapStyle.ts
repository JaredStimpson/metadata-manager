import type { LayerSpecification, StyleSpecification, SymbolLayerSpecification } from 'maplibre-gl';
import { MapPack } from '../../shared/types';

export function buildStyle(pmtilesUrl: string, mapPack: MapPack, showLabels = true): StyleSpecification {
  const available = new Set(mapPack.metadata?.vectorLayers?.map((layer) => layer.id) ?? []);
  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': '#ede9dd' } }
  ];
  const custom = mapPack.metadata?.customStyleLayers;
  if (custom?.length) {
    layers.push(...(custom as unknown as LayerSpecification[]).map((layer) => withLabelVisibility(layer, showLabels)));
  } else {
    pushIfLayer(layers, available, 'earth', {
      id: 'earth', type: 'fill', source: 'offline', 'source-layer': 'earth', paint: { 'fill-color': '#e7dfca' }
    });
    pushIfLayer(layers, available, 'landuse', {
      id: 'landuse', type: 'fill', source: 'offline', 'source-layer': 'landuse', paint: { 'fill-color': '#d6e3c5', 'fill-opacity': 0.55 }
    });
    pushIfLayer(layers, available, 'water', {
      id: 'water', type: 'fill', source: 'offline', 'source-layer': 'water', paint: { 'fill-color': '#9cc9d4' }
    });
    pushIfLayer(layers, available, 'roads', {
      id: 'roads-minor', type: 'line', source: 'offline', 'source-layer': 'roads', paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.2, 12, 2.2] }
    });
    pushIfLayer(layers, available, 'roads', {
      id: 'roads-major', type: 'line', source: 'offline', 'source-layer': 'roads', filter: ['in', ['get', 'kind'], ['literal', ['highway', 'major_road']]], paint: { 'line-color': '#d79f47', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 12, 4] }
    });
    pushIfLayer(layers, available, 'buildings', {
      id: 'buildings', type: 'fill', source: 'offline', 'source-layer': 'buildings', minzoom: 13, paint: { 'fill-color': '#c9bdab', 'fill-opacity': 0.65 }
    });
    layers.push(...buildAutomaticLabels(mapPack, showLabels));
  }
  return {
    version: 8,
    sources: { offline: { type: 'vector', url: `pmtiles://${pmtilesUrl}` } },
    layers
  };
}

function buildAutomaticLabels(mapPack: MapPack, visible: boolean): LayerSpecification[] {
  if (mapPack.metadata?.labelMode === 'none') return [];
  const metadata = mapPack.metadata?.vectorLayers ?? [];
  const findLayer = (patterns: RegExp[]): typeof metadata[number] | undefined =>
    metadata.find((layer) => patterns.some((pattern) => pattern.test(layer.id)) && labelField(layer.fields));
  const place = findLayer([/^places?$/i, /place.*label/i, /^(city|settlement)s?$/i]);
  const road = findLayer([/^roads?$/i, /transport/i]);
  const water = findLayer([/water.*label/i, /water_name/i]);
  const layers: LayerSpecification[] = [];
  if (water) layers.push(labelLayer('labels-water', water.id, labelField(water.fields)!, visible, '#287485', 11));
  if (road) layers.push(labelLayer('labels-road', road.id, labelField(road.fields)!, visible, '#5f5549', 11, true));
  if (place) layers.push(labelLayer('labels-place', place.id, labelField(place.fields)!, visible, '#202b27', 13));
  return layers;
}

function labelLayer(
  id: string,
  sourceLayer: string,
  field: string,
  visible: boolean,
  color: string,
  size: number,
  linePlacement = false
): SymbolLayerSpecification {
  return {
    id,
    type: 'symbol',
    source: 'offline',
    'source-layer': sourceLayer,
    layout: {
      visibility: visible ? 'visible' : 'none',
      'symbol-placement': linePlacement ? 'line' : 'point',
      'text-field': ['get', field],
      'text-font': ['Segoe UI'],
      'text-size': size,
      'text-max-width': 9,
      'text-padding': 2
    },
    paint: { 'text-color': color, 'text-halo-color': '#f7f4ea', 'text-halo-width': 1.2 }
  };
}

function labelField(fields: string[]): string | undefined {
  return ['name', 'name_en', 'name:en', 'ref'].find((candidate) => fields.includes(candidate)) ??
    fields.find((field) => /^name(?:_|:|$)/i.test(field));
}

function pushIfLayer(layers: LayerSpecification[], available: Set<string>, sourceLayer: string, layer: LayerSpecification): void {
  if (available.has(sourceLayer)) layers.push(layer);
}

function withLabelVisibility(layer: LayerSpecification, visible: boolean): LayerSpecification {
  if (layer.type !== 'symbol' || !layer.layout?.['text-field']) return layer;
  return { ...layer, layout: { ...layer.layout, visibility: visible ? 'visible' : 'none' } };
}
