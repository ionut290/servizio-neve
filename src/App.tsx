import { useEffect, useMemo, useState } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from './firebase';
import type { AppUser, GpsPoint, RoadStatusChange, ShiftStatus, SnowRoute, SnowRouteStatus, SnowShift, UserRole } from './types';
import { getCurrentPoint, requestRuntimePermissions, startBackgroundTracking, stopBackgroundTracking } from './gps';
import { flushSyncQueue, getShiftPoints, queueSync, saveShiftLocal } from './storage';
import { SnowMap } from './SnowMap';
import './style.css';

const statuses: SnowRouteStatus[] = ['DA_PULIRE', 'IN_LAVORAZIONE', 'PULITO', 'SALE_SPARSO', 'CHIUSO'];
const emptyRoute: Omit<SnowRoute, 'id'> = { nomePercorso: '', comune: '', zona: '', descrizione: '', stato: 'DA_PULIRE', assegnatoA: [], attivo: true, strade: [] };

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ nome: '', email: '', password: '', telefono: '' });
  const [message, setMessage] = useState('');
  const [view, setView] = useState('home');
  const [online, setOnline] = useState(navigator.onLine);
  const [night, setNight] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [routes, setRoutes] = useState<SnowRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [selectedRoadId, setSelectedRoadId] = useState('');
  const [vehicle, setVehicle] = useState('Spazzaneve 1');
  const [shift, setShift] = useState<SnowShift | null>(null);
  const [points, setPoints] = useState<GpsPoint[]>([]);
  const [newRoute, setNewRoute] = useState(emptyRoute);

  useEffect(() => onAuthStateChanged(auth, setFirebaseUser), []);
  useEffect(() => {
    if (!firebaseUser) { setProfile(null); return; }
    return onSnapshot(doc(db, 'utenti', firebaseUser.uid), snap => setProfile(snap.exists() ? snap.data() as AppUser : null));
  }, [firebaseUser]);
  useEffect(() => {
    if (!profile) return;
    updateDoc(doc(db, 'utenti', profile.uid), { ultimoAccesso: new Date().toISOString() }).catch(() => undefined);
    const routeQuery = profile.ruolo === 'admin' ? query(collection(db, 'percorsiNeve'), orderBy('nomePercorso')) : query(collection(db, 'percorsiNeve'), where('__name__', 'in', profile.percorsiAbilitati.length ? profile.percorsiAbilitati.slice(0, 30) : ['__none__']));
    const unsubRoutes = onSnapshot(routeQuery, snap => setRoutes(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SnowRoute)));
    const unsubUsers = profile.ruolo === 'admin' ? onSnapshot(query(collection(db, 'utenti'), orderBy('creatoIl', 'desc')), snap => setUsers(snap.docs.map(d => d.data() as AppUser))) : undefined;
    return () => { unsubRoutes(); unsubUsers?.(); };
  }, [profile]);
  useEffect(() => { const goOnline = () => { setOnline(true); flushSyncQueue(); }; const goOffline = () => setOnline(false); addEventListener('online', goOnline); addEventListener('offline', goOffline); return () => { removeEventListener('online', goOnline); removeEventListener('offline', goOffline); }; }, []);

  const selectedRoute = routes.find(r => r.id === selectedRouteId) ?? routes[0];
  const selectedRoad = selectedRoute?.strade.find(s => s.id === selectedRoadId) ?? selectedRoute?.strade[0];
  const active = shift?.statoTurno === 'ATTIVO';
  const km = useMemo(() => points.length > 1 ? Number((points.length * 0.05).toFixed(1)) : 0, [points]);

  async function submitAuth() {
    setMessage('');
    if (authMode === 'login') await signInWithEmailAndPassword(auth, form.email, form.password);
    else {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      const userProfile: AppUser = { uid: cred.user.uid, nome: form.nome, email: form.email, telefono: form.telefono, ruolo: 'operatore', abilitato: false, percorsiAbilitati: [], creatoIl: new Date().toISOString(), ultimoAccesso: new Date().toISOString() };
      await setDoc(doc(db, 'utenti', cred.user.uid), userProfile);
      setMessage('Registrazione completata. Attendi l’abilitazione da parte dell’amministratore.');
    }
  }

  async function beginShift() {
    if (!profile || !selectedRoute) return;
    const permissions = await requestRuntimePermissions();
    if (permissions.location.location !== 'granted') setMessage('Abilita la posizione su Android come “Consenti sempre”.');
    const now = new Date().toISOString();
    const next: SnowShift = { id: crypto.randomUUID(), uidOperatore: profile.uid, nomeOperatore: profile.nome, mezzo: vehicle, percorsoId: selectedRoute.id, inizioTurno: now, statoTurno: 'ATTIVO', kmPercorsi: 0, creatoIl: now };
    await setDoc(doc(db, 'turniNeve', next.id), next); await saveShiftLocal(next); await queueSync('shift', next);
    setShift(next); const start = await getCurrentPoint(next.id); setPoints([start]); await startBackgroundTracking(next.id, p => setPoints(prev => [...prev, p]));
  }
  async function setShiftStatus(statoTurno: ShiftStatus) {
    if (!shift) return;
    const next = { ...shift, statoTurno, kmPercorsi: km, ...(statoTurno === 'CHIUSO' ? { fineTurno: new Date().toISOString() } : {}) };
    await setDoc(doc(db, 'turniNeve', next.id), next, { merge: true }); await saveShiftLocal(next); setShift(next); if (statoTurno !== 'ATTIVO') await stopBackgroundTracking();
  }
  async function changeRoadStatus(nuovoStato: SnowRouteStatus) {
    if (!profile || !selectedRoute || !selectedRoad) return;
    const before = selectedRoad.stato ?? selectedRoute.stato;
    const position = await getCurrentPoint(shift?.id ?? 'manuale').catch(() => undefined);
    const strade = selectedRoute.strade.map(s => s.id === selectedRoad.id ? { ...s, stato: nuovoStato } : s);
    await updateDoc(doc(db, 'percorsiNeve', selectedRoute.id), { strade, stato: nuovoStato });
    const change: RoadStatusChange = { uidOperatore: profile.uid, nomeOperatore: profile.nome, percorsoId: selectedRoute.id, stradaId: selectedRoad.id, statoPrecedente: before, nuovoStato, dataOra: new Date().toISOString(), posizioneGps: position, nota: '' };
    await addDoc(collection(db, 'cambiStatoStrade'), change).catch(() => queueSync('road-status', change));
  }
  async function uploadPhoto(file: File, tipo: 'prima' | 'dopo') {
    if (!profile || !selectedRoute) return;
    const path = `fotoNeve/${selectedRoute.id}/${profile.uid}/${Date.now()}-${file.name}`;
    const fileRef = ref(storage, path); await uploadBytes(fileRef, file); const url = await getDownloadURL(fileRef);
    await addDoc(collection(db, 'fotoNeve'), { url, tipo, uidOperatore: profile.uid, nomeOperatore: profile.nome, percorsoId: selectedRoute.id, data: new Date().toISOString() });
  }
  async function createRoute() { await addDoc(collection(db, 'percorsiNeve'), newRoute); setNewRoute(emptyRoute); }
  async function loadReportPoints() { if (shift) setPoints(await getShiftPoints(shift.id)); }

  if (!firebaseUser) return <main className="app auth"><section><h1>❄️ Servizio Neve</h1><h2>{authMode === 'login' ? 'Login' : 'Registrazione operatore'}</h2>{authMode === 'register' && <><label>Nome<input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></label><label>Telefono<input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} /></label></>}<label>Email<input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label><label>Password<input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label><button onClick={submitAuth}>{authMode === 'login' ? 'Entra' : 'Registrati'}</button><button className="secondary" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? 'Crea account' : 'Ho già un account'}</button>{message && <p className="notice">{message}</p>}</section></main>;
  if (!profile || !profile.abilitato) return <main className="app"><section><h1>❄️ Servizio Neve</h1><p className="notice">Registrazione completata. Attendi l’abilitazione da parte dell’amministratore.</p><button onClick={() => signOut(auth)}>Esci</button></section></main>;

  const isAdmin = profile.ruolo === 'admin';
  return <main className={night ? 'app night' : 'app'}>
    <header><h1>❄️ Servizio Neve</h1><div className="badges"><b>{online ? 'ONLINE' : 'OFFLINE'}</b><b>{active ? 'GPS ATTIVO' : 'GPS FERMO'}</b><b>{profile.ruolo.toUpperCase()}</b><button onClick={() => signOut(auth)}>Esci</button></div></header>{message && <section className="guide">{message}</section>}
    <nav>{(isAdmin ? ['home','utenti','percorsi','live','report','impostazioni'] : ['home','turno','mappa','stati','foto','report','impostazioni']).map(v => <button key={v} onClick={() => { setView(v); if (v === 'report') loadReportPoints(); }}>{v}</button>)}</nav>
    {view === 'home' && <section className="grid">{(isAdmin ? ['Utenti','Percorsi neve','Assegna percorsi','Mappa live operatori','Report turni'] : ['I miei percorsi','Inizia turno','Mappa percorso','Stato strade','Foto','Fine turno']).map(label => <button className="tile" key={label}>{label}</button>)}</section>}
    {isAdmin && view === 'utenti' && <section><h2>Utenti</h2>{users.map(u => <div className="row" key={u.uid}><b>{u.nome}</b><span>{u.email}</span><label><input type="checkbox" checked={u.abilitato} onChange={e => updateDoc(doc(db, 'utenti', u.uid), { abilitato: e.target.checked })} /> abilitato</label><select value={u.ruolo} onChange={e => updateDoc(doc(db, 'utenti', u.uid), { ruolo: e.target.value as UserRole })}><option value="operatore">operatore</option><option value="admin">admin</option></select><select multiple value={u.percorsiAbilitati} onChange={e => updateDoc(doc(db, 'utenti', u.uid), { percorsiAbilitati: Array.from(e.currentTarget.selectedOptions).map(o => o.value) })}>{routes.map(r => <option key={r.id} value={r.id}>{r.nomePercorso}</option>)}</select></div>)}</section>}
    {isAdmin && view === 'percorsi' && <section><h2>Percorsi neve</h2>{routes.map(r => <p key={r.id}><b>{r.nomePercorso}</b> · {r.comune} · {r.zona} · {r.stato}</p>)}<h3>Nuovo percorso</h3>{(['nomePercorso','comune','zona','descrizione'] as const).map(k => <label key={k}>{k}<input value={newRoute[k]} onChange={e => setNewRoute({ ...newRoute, [k]: e.target.value })} /></label>)}<label>Strade JSON<textarea placeholder='[{"id":"via-roma","nomeStrada":"Via Roma","ordine":1,"coordinate":[[45.4642,9.19],[45.465,9.191]]}]' onChange={e => setNewRoute({ ...newRoute, strade: JSON.parse(e.target.value || "[]") })} /></label><button onClick={createRoute}>Crea percorso</button></section>}
    {!isAdmin && (view === 'turno' || view === 'home') && <section><h2>Turno neve</h2><label>Percorso<select value={selectedRoute?.id ?? ''} onChange={e => setSelectedRouteId(e.target.value)}>{routes.map(r => <option key={r.id} value={r.id}>{r.nomePercorso}</option>)}</select></label><label>Mezzo<input value={vehicle} onChange={e => setVehicle(e.target.value)} /></label><div className="actions"><button onClick={beginShift}>Inizia turno</button><button onClick={() => setShiftStatus('PAUSA')}>Pausa</button><button onClick={() => setShiftStatus('CHIUSO')}>Fine turno</button></div></section>}
    {!isAdmin && view === 'mappa' && <SnowMap routes={routes} points={points} onSelectRoute={r => setSelectedRouteId(r.id)} />}
    {!isAdmin && view === 'stati' && selectedRoute && <section><h2>Stato strade</h2><label>Strada<select value={selectedRoad?.id ?? ''} onChange={e => setSelectedRoadId(e.target.value)}>{selectedRoute.strade.map(s => <option key={s.id} value={s.id}>{s.nomeStrada}</option>)}</select></label>{statuses.map(s => <button key={s} onClick={() => changeRoadStatus(s)}>{s}</button>)}</section>}
    {!isAdmin && view === 'foto' && <section><h2>Foto</h2><label>Foto prima<input type="file" accept="image/*" onChange={e => e.target.files?.[0] && uploadPhoto(e.target.files[0], 'prima')} /></label><label>Foto dopo<input type="file" accept="image/*" onChange={e => e.target.files?.[0] && uploadPhoto(e.target.files[0], 'dopo')} /></label></section>}
    {view === 'live' && <SnowMap routes={routes} points={points} onSelectRoute={r => setSelectedRouteId(r.id)} />}
    {view === 'report' && <section><h2>Report turni</h2><p>Turno: {shift?.statoTurno ?? 'nessuno'} · Km: {km}</p><pre>{JSON.stringify(shift, null, 2)}</pre></section>}
    {view === 'impostazioni' && <section><h2>Impostazioni</h2><label className="switch"><input type="checkbox" checked={night} onChange={e => setNight(e.target.checked)} /> Modalità notte</label></section>}
  </main>;
}
