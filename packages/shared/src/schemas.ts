import { z } from 'zod';

const id = z.string().min(1);
const optId = id.nullish();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'HH:mm');
const dateTime = z.string().datetime({ offset: true });

export const LocationInput = z.object({
  name: z.string().min(1),
  address: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  type: z.enum(['LODGING', 'VENUE', 'DEPOT', 'STATION', 'OTHER']).default('OTHER'),
  bufferMin: z.number().int().min(0).nullish(),
});

export const EventInput = z.object({
  name: z.string().min(1),
  startDate: date,
  endDate: date,
  defaultBufferMin: z.number().int().min(0).default(15),
  walkThresholdMin: z.number().int().min(0).default(15),
  selfEditLockHours: z.number().int().min(0).default(2),
});

export const PersonInput = z.object({
  name: z.string().min(1),
  phone: z.string().nullish(),
  email: z.string().email().nullish().or(z.literal('')),
  licenses: z.array(z.string()).default([]),
});

export const ParticipationInput = z.object({
  personId: id,
  prio: z.number().int().min(1).max(9).default(5),
  startLocationId: optId,
  earliestDeparture: dateTime.nullish(),
  endLocationId: optId,
  latestArrival: dateTime.nullish(),
  defaultLodgingId: optId,
});

export const TeamInput = z.object({
  name: z.string().min(1),
  color: z.string().default('#228be6'),
  memberIds: z.array(id).default([]),
});

export const ShiftInput = z.object({
  personId: id,
  date,
  start: dateTime,
  end: dateTime,
  locationId: id,
  note: z.string().nullish(),
  teamId: optId,
});

/** Set the same shift for many persons on many days in one go. */
export const BulkShiftInput = z.object({
  personIds: z.array(id).min(1),
  dates: z.array(date).min(1),
  start: hhmm,
  end: hhmm,
  locationId: id,
  note: z.string().nullish(),
  teamId: optId,
  /** Remove existing shifts of these persons on these days first. */
  replace: z.boolean().default(true),
  /** Client time zone offset in minutes (Date#getTimezoneOffset) to build timestamps. */
  tzOffsetMin: z.number().int().default(0),
});

export const BulkDeleteShiftsInput = z.object({
  personIds: z.array(id).min(1),
  dates: z.array(date).min(1),
});

export const BulkLodgingInput = z.object({
  entries: z
    .array(z.object({ personId: id, night: date, locationId: optId }))
    .min(1),
});

export const VehicleInput = z.object({
  name: z.string().min(1),
  plate: z.string().nullish(),
  type: z.enum(['CAR', 'VAN', 'TRUCK', 'TRAILER']).default('CAR'),
  seats: z.number().int().min(0),
  licenseRequired: z.string().nullish(),
  hasHitch: z.boolean().default(false),
  depotLocationId: optId,
  availabilities: z.array(z.object({ from: dateTime, to: dateTime })).default([]),
});

export const DistanceInput = z.object({
  entries: z
    .array(
      z.object({
        fromId: id,
        toId: id,
        kind: z.enum(['VEHICLE', 'WALK', 'PUBLIC', 'TAXI', 'SHUTTLE', 'OTHER']),
        minutes: z.number().int().min(0).nullable(),
      }),
    )
    .min(1),
});

export const TripInput = z.object({
  vehicleId: id,
  trailerId: optId,
  driverId: optId,
  status: z.enum(['PLANNED', 'CONFIRMED', 'ACTIVE', 'DONE', 'CANCELLED']).default('PLANNED'),
  note: z.string().nullish(),
  stops: z
    .array(
      z.object({
        /** Client-side key, used by passengers to reference stops. */
        ref: z.string(),
        locationId: id,
        arrival: dateTime.nullish(),
        departure: dateTime.nullish(),
      }),
    )
    .min(2),
  passengers: z
    .array(z.object({ personId: id, fromRef: z.string(), toRef: z.string(), demandKey: z.string().nullish() }))
    .default([]),
});

export const OverrideInput = z.object({
  demandKey: z.string().min(1),
  kind: z.enum(['VEHICLE', 'WALK', 'PUBLIC', 'TAXI', 'SHUTTLE', 'OTHER']).nullable(),
  note: z.string().nullish(),
});

export const LoginInput = z.object({ email: z.string().email(), password: z.string().min(1) });

export type TripInputT = z.infer<typeof TripInput>;
export type BulkShiftInputT = z.infer<typeof BulkShiftInput>;
