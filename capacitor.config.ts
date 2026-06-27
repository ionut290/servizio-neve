import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'it.servizioneve.app',
  appName: 'Servizio Neve',
  webDir: 'dist',
  plugins: {
    BackgroundGeolocation: {
      notificationTitle: 'Servizio neve attivo',
      notificationText: 'Registrazione percorso neve in background',
      distanceFilter: 50,
      interval: 30000,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_snow',
      iconColor: '#0b7bd3',
    },
  },
};

export default config;
