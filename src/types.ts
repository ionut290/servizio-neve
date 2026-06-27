export type UserRole = 'admin' | 'operatore';
export type SnowRouteStatus = 'DA_PULIRE' | 'IN_LAVORAZIONE' | 'PULITO' | 'SALE_SPARSO' | 'CHIUSO';
export type ShiftStatus = 'ATTIVO' | 'PAUSA' | 'CHIUSO';

export interface AppUser {
  uid: string;
  nome: string;
  email: string;
  telefono: string;
  ruolo: UserRole;
  abilitato: boolean;
  percorsiAbilitati: string[];
  creatoIl: string;
  ultimoAccesso?: string;
}

export interface SnowRoad {
  id: string;
  nomeStrada: string;
  ordine: number;
  coordinate: [number, number][];
  stato?: SnowRouteStatus;
}

export interface SnowRoute {
  id: string;
  nomePercorso: string;
  comune: string;
  zona: string;
  descrizione: string;
  strade: SnowRoad[];
  stato: SnowRouteStatus;
  assegnatoA: string[];
  attivo: boolean;
}

export interface GpsPoint {
  id: string;
  shiftId: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number | null;
  timestamp: string;
}

export interface SnowShift {
  id: string;
  uidOperatore: string;
  nomeOperatore: string;
  mezzo: string;
  percorsoId: string;
  inizioTurno: string;
  fineTurno?: string;
  statoTurno: ShiftStatus;
  kmPercorsi: number;
  creatoIl: string;
}

export interface RoadStatusChange {
  uidOperatore: string;
  nomeOperatore: string;
  percorsoId: string;
  stradaId: string;
  statoPrecedente: SnowRouteStatus;
  nuovoStato: SnowRouteStatus;
  dataOra: string;
  posizioneGps?: Pick<GpsPoint, 'lat' | 'lng' | 'accuracy' | 'timestamp'>;
  nota?: string;
}
