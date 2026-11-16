/**
 * Domain types shared by API and web client.
 * Times are ISO-8601 strings; dates (days/nights) are 'YYYY-MM-DD'.
 */

export type ID = string;

export type LocationType = 'LODGING' | 'VENUE' | 'DEPOT' | 'STATION' | 'OTHER';
export type VehicleType = 'CAR' | 'VAN' | 'TRUCK' | 'TRAILER';
export type TransportKind = 'VEHICLE' | 'WALK' | 'PUBLIC' | 'TAXI' | 'SHUTTLE' | 'OTHER';
export type TripStatus = 'PLANNED' | 'CONFIRMED' | 'ACTIVE' | 'DONE' | 'CANCELLED';

export interface Location {
  id: ID;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  type: LocationType;
  /** Minutes a person must arrive before shift start at this location (overrides event default). */
  bufferMin?: number | null;
}

export interface EventInfo {
  id: ID;
  name: string;
  startDate: string;
  endDate: string;
  defaultBufferMin: number;
  /** Walking distances up to this many minutes need no transport. */
  walkThresholdMin: number;
  /** Shift self-correction locked this many hours before start (Phase 2). */
  selfEditLockHours: number;
}

export interface Person {
  id: ID;
  name: string;
  phone?: string | null;
  email?: string | null;
  /** Driving licence classes, e.g. ['B','BE','C1']. */
  licenses: string[];
}

export interface Participation {
  id: ID;
  personId: ID;
  /** 1 = highest priority. */
  prio: number;
  startLocationId?: ID | null;
  earliestDeparture?: string | null;
  endLocationId?: ID | null;
  latestArrival?: string | null;
  /** Used for every night without explicit lodging entry. */
  defaultLodgingId?: ID | null;
}

export interface Lodging {
  personId: ID;
  night: string;
  locationId: ID;
}

export interface Shift {
  id: ID;
  personId: ID;
  date: string;
  start: string;
  end: string;
  locationId: ID;
  note?: string | null;
  teamId?: ID | null;
}

export interface Vehicle {
  id: ID;
  name: string;
  type: VehicleType;
  /** Passenger seats excluding the driver. */
  seats: number;
  licenseRequired?: string | null;
  hasHitch: boolean;
  depotLocationId?: ID | null;
}

export interface Availability {
  vehicleId: ID;
  from: string;
  to: string;
}

export interface Distance {
  fromId: ID;
  toId: ID;
  kind: TransportKind;
  minutes: number;
}

export interface Stop {
  id: ID;
  order: number;
  locationId: ID;
  arrival?: string | null;
  departure?: string | null;
}

export interface Passenger {
  id: ID;
  personId: ID;
  fromStopId: ID;
  toStopId: ID;
  demandKey?: string | null;
}

export interface Trip {
  id: ID;
  vehicleId: ID;
  trailerId?: ID | null;
  driverId?: ID | null;
  status: TripStatus;
  note?: string | null;
  stops: Stop[];
  passengers: Passenger[];
}

/** Alternative solution for a demand (walk, public transport, taxi, own arrangement). */
export interface DemandOverride {
  demandKey: string;
  kind: TransportKind;
  note?: string | null;
}

export type DemandKind = 'ARRIVAL' | 'MORNING' | 'TRANSFER' | 'EVENING' | 'DEPARTURE' | 'REQUEST';
export type DemandStatus = 'OPEN' | 'COVERED' | 'WALK' | 'ALTERNATIVE' | 'INVALID';

export interface Demand {
  key: string;
  personId: ID;
  prio: number;
  kind: DemandKind;
  date: string;
  fromId: ID | null;
  toId: ID | null;
  /** Person is available from this time on (null = any time). */
  earliestDeparture: string | null;
  /** Person must be at destination by this time (null = no deadline). */
  latestArrival: string | null;
  status: DemandStatus;
  tripId?: ID;
  note?: string;
}

export type Severity = 'ERROR' | 'WARNING' | 'INFO';

export type ConflictCode =
  | 'UNCOVERED'
  | 'MISSING_LOCATION'
  | 'LATE_ARRIVAL'
  | 'EARLY_PICKUP'
  | 'WRONG_ROUTE'
  | 'ORPHAN_PASSENGER'
  | 'OVERBOOKED'
  | 'VEHICLE_UNAVAILABLE'
  | 'VEHICLE_DOUBLE_BOOKED'
  | 'NO_DRIVER'
  | 'DRIVER_LICENSE'
  | 'TRAILER_NO_HITCH'
  | 'DRIVER_BUSY'
  | 'DRIVER_REST'
  | 'PASSENGER_DOUBLE_BOOKED'
  | 'VEHICLE_POSITION'
  | 'TIME_TOO_SHORT'
  | 'STOP_TIME_MISSING';

export interface Conflict {
  code: ConflictCode;
  severity: Severity;
  /** Sort key: lower = more important (person prio). */
  prio: number;
  time: string | null;
  personId?: ID;
  tripId?: ID;
  vehicleId?: ID;
  demandKey?: string;
  /** Free parameters for i18n message interpolation. */
  params?: Record<string, string | number>;
}

export interface PlanInput {
  event: EventInfo;
  locations: Location[];
  persons: Person[];
  participations: Participation[];
  lodgings: Lodging[];
  shifts: Shift[];
  vehicles: Vehicle[];
  availabilities: Availability[];
  distances: Distance[];
  trips: Trip[];
  overrides: DemandOverride[];
}

export interface PlanResult {
  demands: Demand[];
  conflicts: Conflict[];
}
