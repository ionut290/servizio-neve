export type RoadStatus = 'DA PULIRE' | 'IN LAVORAZIONE' | 'PULITA' | 'SALE SPARSO' | 'CHIUSA';

export interface GpsPoint {
  id: string;
  shiftId: string;
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp: string;
}

export interface SnowShift {
  id: string;
  operator: string;
  vehicle: string;
  status: 'idle' | 'active' | 'paused' | 'ended';
  startedAt?: string;
  pausedAt?: string;
  endedAt?: string;
  startGps?: Pick<GpsPoint, 'lat' | 'lng' | 'accuracy' | 'timestamp'>;
  endGps?: Pick<GpsPoint, 'lat' | 'lng' | 'accuracy' | 'timestamp'>;
}

export interface RoadZone {
  id: string;
  name: string;
  status: RoadStatus;
  saltKg: number;
  notes: string;
  issues: string;
  beforePhoto?: string;
  afterPhoto?: string;
  startedAt?: string;
  completedAt?: string;
  coordinates: [number, number][];
}
