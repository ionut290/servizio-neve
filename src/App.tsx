import { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import type { GpsPoint, RoadStatus, RoadZone, SnowShift } from './types';
import { getCurrentPoint, requestRuntimePermissions, startBackgroundTracking, stopBackgroundTracking } from './gps';
import { getRoads, getShiftPoints, queueSync, saveRoad, saveShift } from './storage';
import { SnowMap } from './SnowMap';
import './style.css';

const seedRoads: RoadZone[] = [
  { id: 'centro', name: 'Via Centro - Municipio', status: 'DA PULIRE', saltKg: 0, notes: '', issues: '', coordinates: [[45.4642, 9.19], [45.4656, 9.193]] },
  { id: 'scuole', name: 'Zona scuole', status: 'DA PULIRE', saltKg: 0, notes: '', issues: '', coordinates: [[45.466, 9.188], [45.467, 9.191]] },
  { id: 'collina', name: 'Strada Collina', status: 'CHIUSA', saltKg: 0, notes: 'Verificare ghiaccio', issues: '', coordinates: [[45.462, 9.185], [45.459, 9.181]] },
];
const statuses: RoadStatus[] = ['DA PULIRE', 'IN LAVORAZIONE', 'PULITA', 'SALE SPARSO', 'CHIUSA'];

export default function App() {
  const [view, setView] = useState('home');
  const [online, setOnline] = useState(navigator.onLine);
  const [night, setNight] = useState(false);
  const [operator, setOperator] = useState('Mario Rossi');
  const [vehicle, setVehicle] = useState('Spazzaneve 1');
  const [shift, setShift] = useState<SnowShift>({ id: crypto.randomUUID(), operator, vehicle, status: 'idle' });
  const [points, setPoints] = useState<GpsPoint[]>([]);
  const [roads, setRoads] = useState<RoadZone[]>(seedRoads);
  const [selectedRoad, setSelectedRoad] = useState<RoadZone>(seedRoads[0]);
  const [permissionGuide, setPermissionGuide] = useState(false);

  useEffect(() => {
    const load = async () => { const stored = await getRoads(); if (stored.length) setRoads(stored); else seedRoads.forEach(saveRoad); };
    load();
    const goOnline = () => setOnline(true); const goOffline = () => setOnline(false);
    addEventListener('online', goOnline); addEventListener('offline', goOffline);
    return () => { removeEventListener('online', goOnline); removeEventListener('offline', goOffline); };
  }, []);

  const km = useMemo(() => points.length > 1 ? (points.length * 0.05).toFixed(1) : '0.0', [points]);
  const active = shift.status === 'active';

  async function beginShift() {
    const permissions = await requestRuntimePermissions();
    if (permissions.location.location !== 'granted') setPermissionGuide(true);
    const next = { ...shift, id: crypto.randomUUID(), operator, vehicle, status: 'active' as const, startedAt: new Date().toISOString() };
    const start = await getCurrentPoint(next.id);
    next.startGps = start;
    setShift(next); setPoints([start]); await saveShift(next); await queueSync('shift-start', next);
    await startBackgroundTracking(next.id, point => setPoints(prev => [...prev, point]));
  }

  async function pauseShift() { const next = { ...shift, status: 'paused' as const, pausedAt: new Date().toISOString() }; setShift(next); await saveShift(next); await stopBackgroundTracking(); }
  async function endShift() { const end = await getCurrentPoint(shift.id); const next = { ...shift, status: 'ended' as const, endedAt: new Date().toISOString(), endGps: end }; setShift(next); setPoints(prev => [...prev, end]); await saveShift(next); await queueSync('shift-end', next); await stopBackgroundTracking(); }
  async function updateRoad(patch: Partial<RoadZone>) { const updated = { ...selectedRoad, ...patch }; setSelectedRoad(updated); setRoads(rs => rs.map(r => r.id === updated.id ? updated : r)); await saveRoad(updated); await queueSync('road-intervention', updated); }
  async function loadReportPoints() { if (shift.id) setPoints(await getShiftPoints(shift.id)); }
  function exportPdf() { const doc = new jsPDF(); doc.text(`Report Servizio Neve\nOperatore: ${operator}\nMezzo: ${vehicle}\nKm percorsi: ${km}\nStrade pulite: ${roads.filter(r => r.status === 'PULITA').length}\nSale usato: ${roads.reduce((s, r) => s + Number(r.saltKg || 0), 0)} kg`, 12, 16); doc.save('report-servizio-neve.pdf'); }
  function sendWhatsApp() { window.open(`https://wa.me/?text=${encodeURIComponent(`Report Servizio Neve - ${operator}, ${vehicle}, ${km} km, ${roads.filter(r => r.status === 'PULITA').length} strade pulite`)}`, '_blank'); }

  return <main className={night ? 'app night' : 'app'}>
    <header><h1>❄️ Servizio Neve</h1><div className="badges"><b>{online ? 'ONLINE' : 'OFFLINE'}</b><b>{active ? 'GPS ATTIVO' : 'GPS FERMO'}</b><b>{shift.status === 'active' ? 'TURNO ATTIVO' : 'TURNO NON ATTIVO'}</b></div></header>
    {permissionGuide && <section className="guide"><h2>Permessi necessari</h2><p>Per Android abilita posizione “Consenti sempre”, notifiche e risparmio energetico escluso: la PWA web da sola non garantisce GPS background affidabile.</p></section>}
    <nav>{['home','turno','mappa','interventi','report','impostazioni'].map(v => <button key={v} onClick={() => { setView(v); if (v === 'report') loadReportPoints(); }}>{v === 'home' ? 'Home' : v}</button>)}</nav>
    {view === 'home' && <section className="grid">{['Inizia turno neve','Mappa strade','Interventi','Report','Impostazioni'].map((label, i) => <button className="tile" onClick={() => setView(['turno','mappa','interventi','report','impostazioni'][i])} key={label}>{label}</button>)}</section>}
    {view === 'turno' && <section><h2>Turno neve</h2><label>Operatore<input value={operator} onChange={e => setOperator(e.target.value)} /></label><label>Mezzo<input value={vehicle} onChange={e => setVehicle(e.target.value)} /></label><div className="actions"><button onClick={beginShift}>INIZIA TURNO</button><button onClick={pauseShift}>PAUSA</button><button onClick={endShift}>FINE TURNO</button></div><pre>{JSON.stringify(shift, null, 2)}</pre></section>}
    {view === 'mappa' && <SnowMap roads={roads} points={points} onSelectRoad={setSelectedRoad} />}
    {view === 'interventi' && <section><h2>Intervento strada</h2><select value={selectedRoad.id} onChange={e => setSelectedRoad(roads.find(r => r.id === e.target.value) ?? roads[0])}>{roads.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select><select value={selectedRoad.status} onChange={e => updateRoad({ status: e.target.value as RoadStatus })}>{statuses.map(s => <option key={s}>{s}</option>)}</select><button onClick={() => updateRoad({ status: 'IN LAVORAZIONE', startedAt: new Date().toISOString() })}>Inizia pulizia</button><button onClick={() => updateRoad({ status: 'PULITA', completedAt: new Date().toISOString() })}>Tratto completato</button><label>Quantità sale kg<input type="number" value={selectedRoad.saltKg} onChange={e => updateRoad({ saltKg: Number(e.target.value) })} /></label><label>Problemi trovati<textarea value={selectedRoad.issues} onChange={e => updateRoad({ issues: e.target.value })} /></label><label>Note<textarea value={selectedRoad.notes} onChange={e => updateRoad({ notes: e.target.value })} /></label><label>Foto prima<input type="file" accept="image/*" /></label><label>Foto dopo<input type="file" accept="image/*" /></label></section>}
    {view === 'report' && <section><h2>Report turno</h2><p>Operatore: {operator} · Mezzo: {vehicle} · Km: {km} · Sale: {roads.reduce((s, r) => s + Number(r.saltKg || 0), 0)} kg</p><p>Strade pulite: {roads.filter(r => r.status === 'PULITA').map(r => r.name).join(', ') || 'nessuna'}</p><button onClick={exportPdf}>Esporta PDF</button><button onClick={sendWhatsApp}>Invia WhatsApp</button></section>}
    {view === 'impostazioni' && <section><h2>Impostazioni</h2><label className="switch"><input type="checkbox" checked={night} onChange={e => setNight(e.target.checked)} /> Modalità notte</label><p>Sincronizzazione Firestore opzionale: i dati offline sono accodati in IndexedDB e possono essere inviati quando torna la connessione.</p></section>}
  </main>;
}
