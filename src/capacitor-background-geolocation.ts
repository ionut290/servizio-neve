import { registerPlugin } from '@capacitor/core';

export interface BackgroundLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface BackgroundGeolocationPlugin {
  addWatcher(options: Record<string, unknown>, callback: (location?: BackgroundLocation, error?: unknown) => void): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
}

export const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');
