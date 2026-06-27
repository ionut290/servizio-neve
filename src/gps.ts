import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { BackgroundGeolocation } from './capacitor-background-geolocation';
import type { GpsPoint } from './types';
import { db } from './firebase';
import { savePoint, queueSync } from './storage';

let watcherId: string | undefined;

export async function requestRuntimePermissions() {
  const location = await Geolocation.requestPermissions({ permissions: ['location'] });
  const notifications = await LocalNotifications.requestPermissions();
  return { location, notifications, alwaysHint: Capacitor.getPlatform() === 'android' };
}

export async function getCurrentPoint(shiftId: string): Promise<GpsPoint> {
  const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
  return {
    id: crypto.randomUUID(),
    shiftId,
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    speed: pos.coords.speed,
    timestamp: new Date(pos.timestamp).toISOString(),
  };
}

async function persistGpsPoint(point: GpsPoint) {
  await savePoint(point);
  if (navigator.onLine) {
    try {
      await setDoc(doc(db, 'turniNeve', point.shiftId, 'gps', point.id), point);
      return;
    } catch {
      // Firestore offline persistence or IndexedDB queue will retry later.
    }
  }
  await queueSync('gps-point', point);
}

export async function startBackgroundTracking(shiftId: string, onPoint: (point: GpsPoint) => void) {
  await LocalNotifications.schedule({ notifications: [{ id: 1001, title: 'Servizio neve attivo', body: 'Servizio neve attivo - tracciamento GPS in corso', ongoing: true }] });

  if (Capacitor.isNativePlatform()) {
    watcherId = await BackgroundGeolocation.addWatcher({
      backgroundMessage: 'Servizio neve attivo - tracciamento GPS in corso',
      backgroundTitle: 'Servizio neve attivo',
      requestPermissions: true,
      stale: false,
      distanceFilter: 50,
    }, async (location, error) => {
      if (error || !location) return;
      const point: GpsPoint = { id: crypto.randomUUID(), shiftId, lat: location.latitude, lng: location.longitude, accuracy: location.accuracy, speed: location.speed, timestamp: new Date().toISOString() };
      await persistGpsPoint(point); onPoint(point);
    });
    return;
  }

  watcherId = String(window.setInterval(async () => {
    const point = await getCurrentPoint(shiftId);
    await persistGpsPoint(point); onPoint(point);
  }, 30000));
}

export async function stopBackgroundTracking() {
  await LocalNotifications.cancel({ notifications: [{ id: 1001 }] });
  if (!watcherId) return;
  if (Capacitor.isNativePlatform()) await BackgroundGeolocation.removeWatcher({ id: watcherId });
  else window.clearInterval(Number(watcherId));
  watcherId = undefined;
}
