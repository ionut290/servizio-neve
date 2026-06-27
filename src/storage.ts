import { openDB } from 'idb';
import type { DBSchema } from 'idb';
import type { GpsPoint, RoadZone, SnowShift } from './types';

interface SnowDb extends DBSchema {
  shifts: { key: string; value: SnowShift };
  points: { key: string; value: GpsPoint; indexes: { 'by-shift': string } };
  roads: { key: string; value: RoadZone };
  syncQueue: { key: string; value: { id: string; type: string; payload: unknown; createdAt: string } };
}

export const dbPromise = openDB<SnowDb>('servizio-neve', 1, {
  upgrade(db) {
    db.createObjectStore('shifts', { keyPath: 'id' });
    const points = db.createObjectStore('points', { keyPath: 'id' });
    points.createIndex('by-shift', 'shiftId');
    db.createObjectStore('roads', { keyPath: 'id' });
    db.createObjectStore('syncQueue', { keyPath: 'id' });
  },
});

export async function saveShift(shift: SnowShift) { (await dbPromise).put('shifts', shift); }
export async function savePoint(point: GpsPoint) { (await dbPromise).put('points', point); }
export async function saveRoad(road: RoadZone) { (await dbPromise).put('roads', road); }
export async function getRoads() { return (await dbPromise).getAll('roads'); }
export async function getShiftPoints(shiftId: string) { return (await dbPromise).getAllFromIndex('points', 'by-shift', shiftId); }
export async function queueSync(type: string, payload: unknown) {
  (await dbPromise).put('syncQueue', { id: crypto.randomUUID(), type, payload, createdAt: new Date().toISOString() });
}
