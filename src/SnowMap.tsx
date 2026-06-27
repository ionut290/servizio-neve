import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { GpsPoint, SnowRoute, SnowRouteStatus } from './types';

const statusColor: Record<SnowRouteStatus, string> = {
  DA_PULIRE: '#ef4444',
  IN_LAVORAZIONE: '#f59e0b',
  PULITO: '#22c55e',
  SALE_SPARSO: '#38bdf8',
  CHIUSO: '#64748b',
};

export function SnowMap({ routes, points, onSelectRoute }: { routes: SnowRoute[]; points: GpsPoint[]; onSelectRoute: (route: SnowRoute) => void }) {
  const firstRoad = routes.flatMap(route => route.strade)[0];
  const center: [number, number] = points[points.length - 1] ? [points[points.length - 1].lat, points[points.length - 1].lng] : firstRoad?.coordinate?.[0] ?? [45.4642, 9.19];
  return <section><h2>Mappa percorso</h2><div className="map"><MapContainer center={center} zoom={14} scrollWheelZoom>
    <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    {points.length > 0 && <><Marker position={center}><Popup>Posizione operatore</Popup></Marker><Polyline positions={points.map(p => [p.lat, p.lng])} pathOptions={{ color: '#0ea5e9', weight: 6 }} /></>}
    {routes.flatMap(route => route.strade.map(road => <Polyline key={`${route.id}-${road.id}`} positions={road.coordinate} pathOptions={{ color: statusColor[road.stato ?? route.stato], weight: 9 }} eventHandlers={{ click: () => onSelectRoute(route) }}><Popup><strong>{route.nomePercorso}</strong><br />{road.nomeStrada}<br />{road.stato ?? route.stato}</Popup></Polyline>))}
  </MapContainer></div><div className="legend">{Object.entries(statusColor).map(([s, c]) => <span key={s}><i style={{ background: c }} />{s}</span>)}</div></section>;
}
