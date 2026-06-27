import { openDB } from 'idb';
import type { DBSchema } from 'idb';
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { GpsPoint, RoadStatusChange, SnowShift } from './types';

interface SnowDb extends DBSchema {
  shifts: { key: string; value: SnowShift };
  points: { key: string; value: GpsPoint; indexes: { 'by-shift': string } };
  syncQueue: { key: string; value: { id: string; type: string; payload: unknown; createdAt: string } };
}

export const dbPromise = openDB<SnowDb>('servizio-neve', 2, {
  upgrade(db, oldVersion) {
    if (!db.objectStoreNames.contains('shifts')) db.createObjectStore('shifts', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('points')) {
      const points = db.createObjectStore('points', { keyPath: 'id' });
      points.createIndex('by-shift', 'shiftId');
    }
    if (!db.objectStoreNames.contains('syncQueue')) db.createObjectStore('syncQueue', { keyPath: 'id' });
    if (oldVersion < 2 && db.objectStoreNames.contains('roads')) db.deleteObjectStore('roads');
  },
});

export async function saveShiftLocal(shift: SnowShift) { (await dbPromise).put('shifts', shift); }
export async function savePoint(point: GpsPoint) { (await dbPromise).put('points', point); }
export async function getShiftPoints(shiftId: string) { return (await dbPromise).getAllFromIndex('points', 'by-shift', shiftId); }
export async function queueSync(type: string, payload: unknown) { (await dbPromise).put('syncQueue', { id: crypto.randomUUID(), type, payload, createdAt: new Date().toISOString() }); }

export async function flushSyncQueue() {
  const database = await dbPromise;
  const queued = await database.getAll('syncQueue');
  for (const item of queued) {
    if (item.type === 'gps-point') {
      const point = item.payload as GpsPoint;
      await setDoc(doc(db, 'turniNeve', point.shiftId, 'gps', point.id), { ...point, timestamp: point.timestamp });
    }
    if (item.type === 'shift') {
      const shift = item.payload as SnowShift;
      await setDoc(doc(db, 'turniNeve', shift.id), shift, { merge: true });
    }
    if (item.type === 'road-status') {
      const change = item.payload as RoadStatusChange;
      await addDoc(collection(db, 'cambiStatoStrade'), { ...change, creatoIl: serverTimestamp() });
    }
    await database.delete('syncQueue', item.id);
  }
}
