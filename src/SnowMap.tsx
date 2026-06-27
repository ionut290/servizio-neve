import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { GpsPoint, RoadZone } from './types';

const statusColor: Record<RoadZone['status'], string> = {
  'DA PULIRE': '#ef4444',
  'IN LAVORAZIONE': '#f59e0b',
  'PULITA': '#22c55e',
  'SALE SPARSO': '#38bdf8',
  'CHIUSA': '#64748b',
};

export function SnowMap({ roads, points, onSelectRoad }: { roads: RoadZone[]; points: GpsPoint[]; onSelectRoad: (road: RoadZone) => void }) {
  const center: [number, number] = points[points.length - 1] ? [points[points.length - 1].lat, points[points.length - 1].lng] : [45.4642, 9.19];
  return <section><h2>Mappa strade</h2><div className="map"><MapContainer center={center} zoom={14} scrollWheelZoom>
    <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    {points.length > 0 && <><Marker position={center}><Popup>Posizione operatore</Popup></Marker><Polyline positions={points.map(p => [p.lat, p.lng])} pathOptions={{ color: '#0ea5e9', weight: 6 }} /></>}
    {roads.map(road => <Polyline key={road.id} positions={road.coordinates} pathOptions={{ color: statusColor[road.status], weight: 9 }} eventHandlers={{ click: () => onSelectRoad(road) }}><Popup><strong>{road.name}</strong><br />{road.status}</Popup></Polyline>)}
  </MapContainer></div><div className="legend">{Object.entries(statusColor).map(([s, c]) => <span key={s}><i style={{ background: c }} />{s}</span>)}</div></section>;
}
