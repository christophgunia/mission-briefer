import type { Dict } from './de';

export const en: Dict = {
  app: { title: 'Mission Briefer', logout: 'Log out', event: 'Event', noEvent: 'No event selected' },
  nav: {
    dashboard: 'Overview', board: 'Dispatch board', vehicles: 'Vehicle usage', people: 'People', shifts: 'Shifts',
    lodging: 'Accommodation', masterVehicles: 'Vehicles', locations: 'Locations', distances: 'Travel times', events: 'Events',
  },
  common: {
    save: 'Save', cancel: 'Cancel', delete: 'Delete', add: 'Add', edit: 'Edit', close: 'Close', name: 'Name',
    search: 'Search …', saved: 'Saved', none: '–', all: 'All', day: 'Day', print: 'Print', selected: '{{count}} selected',
    clear: 'Clear', apply: 'Apply', from: 'From', to: 'To', minutes: 'min', confirmDelete: 'Really delete?',
    notes: 'Notes', time: 'Time', team: 'Team', location: 'Location',
  },
  login: { title: 'Sign in', email: 'Email', password: 'Password', submit: 'Sign in', failed: 'Sign-in failed' },
  event: {
    name: 'Name', start: 'From', end: 'To', buffer: 'Default buffer before shift (min)', walk: 'Walking threshold (min)',
    lock: 'Self-edit locked (h before shift)', create: 'New event',
  },
  location: {
    type: 'Type', address: 'Address', buffer: 'Buffer (min)',
    types: { LODGING: 'Accommodation', VENUE: 'Venue', DEPOT: 'Depot', STATION: 'Station', OTHER: 'Other' },
  },
  vehicle: {
    type: 'Type', seats: 'Seats', license: 'Licence', hitch: 'Hitch', depot: 'Base', plate: 'Plate',
    availability: 'Availability', addAvailability: 'Add period', alwaysAvailable: 'always available',
    types: { CAR: 'Car', VAN: 'Van', TRUCK: 'Truck', TRAILER: 'Trailer' },
  },
  person: {
    prio: 'Prio', phone: 'Phone', email: 'Email', licenses: 'Licence', start: 'Start', end: 'End',
    lodging: 'Accommodation (default)', teams: 'Teams', earliest: 'Earliest from', latest: 'Latest at',
    import: 'Paste from Excel', importHelp: 'Columns: Name, Phone, Email, Licence (B,BE), Prio, Team. First row may be a header.',
    imported: '{{count}} people imported', add: 'Add person', unsaved: '{{count}} unsaved changes',
  },
  shifts: {
    title: 'Shift plan', teamSelect: 'Team', allPersons: 'All people', setForSelection: 'Set shift for selection',
    selectHelp: 'Drag over cells or click row/column headers. Ctrl/Shift to add. Del deletes.',
    start: 'Start', end: 'End', replace: 'Replace existing shifts on these days', templates: 'Templates',
    saveTemplate: 'Save as template', copyPrevDay: 'Copy previous day', setCount: '{{count}} shifts set',
    deleteSelection: 'Delete selection', wholeTeam: 'Whole team, all days',
  },
  lodging: {
    title: 'Accommodation', help: 'Select cells, then choose accommodation. Paste from Excel with Ctrl+V (accommodation names).',
    setFor: 'Accommodation for selection', default: 'Default', fillRow: 'Whole row', unknown: 'Unknown accommodation: {{name}}',
  },
  distances: { title: 'Travel times (minutes)', help: 'Row = from, column = to. Empty cell = reverse direction or unknown.', kind: 'Mode' },
  kinds: { VEHICLE: 'Vehicle', WALK: 'Walk', PUBLIC: 'Public transport', TAXI: 'Taxi', SHUTTLE: 'Shuttle', OTHER: 'Own/other' },
  demand: {
    open: 'Open demands', kinds: { ARRIVAL: 'Arrival', MORNING: 'Morning', TRANSFER: 'Transfer', EVENING: 'Evening', DEPARTURE: 'Departure', REQUEST: 'Request' },
    status: { OPEN: 'open', COVERED: 'covered', WALK: 'walk', ALTERNATIVE: 'alternative', INVALID: 'data missing' },
    by: 'by {{time}}', after: 'from {{time}}', alternative: 'Alternative …', dragHint: 'Drag onto a vehicle', showAll: 'show solved too',
  },
  trip: {
    title: 'Trip', new: 'New trip', driver: 'Driver', vehicle: 'Vehicle', trailer: 'Trailer', stops: 'Stops',
    passengers: 'Passengers', arrival: 'Arrival', departure: 'Departure', addStop: 'Add stop', status: 'Status',
    addPassenger: 'Add passenger', seatsFree: '{{free}} of {{seats}} free', created: 'Trip created',
    addedTo: 'Added to existing trip', statuses: { PLANNED: 'planned', CONFIRMED: 'confirmed', ACTIVE: 'on the way', DONE: 'done', CANCELLED: 'cancelled' },
    print: 'Print schedule',
  },
  conflicts: {
    title: 'Conflicts', none: 'No conflicts 🎉',
    codes: {
      UNCOVERED: 'Missing trip: {{person}} ({{kind}})',
      MISSING_LOCATION: 'Location missing: {{person}} ({{kind}})',
      LATE_ARRIVAL: '{{person}} arrives {{minutes}} min late',
      EARLY_PICKUP: '{{person}} picked up {{minutes}} min too early',
      WRONG_ROUTE: '{{person}}: pickup/drop-off does not match demand',
      ORPHAN_PASSENGER: '{{person}}: demand no longer exists (shift changed?)',
      OVERBOOKED: '{{vehicle}} overbooked: {{load}}/{{seats}}',
      VEHICLE_UNAVAILABLE: '{{vehicle}} not available',
      VEHICLE_DOUBLE_BOOKED: '{{vehicle}} double-booked',
      NO_DRIVER: 'Trip without driver ({{vehicle}})',
      DRIVER_LICENSE: '{{person}} lacks licence {{license}}',
      TRAILER_NO_HITCH: '{{vehicle}} has no hitch',
      DRIVER_BUSY: 'Driver {{person}} is busy at that time',
      DRIVER_REST: 'Rest of {{person}} only {{hours}} h',
      PASSENGER_DOUBLE_BOOKED: '{{person}} on two trips at once',
      VEHICLE_POSITION: '{{vehicle}} is not at the start location',
      TIME_TOO_SHORT: 'Driving time too short ({{planned}} instead of {{need}} min)',
      STOP_TIME_MISSING: 'Times missing ({{vehicle}})',
    },
  },
  dashboard: {
    title: 'Overview', open: 'Open', covered: 'Covered', errors: 'Errors', warnings: 'Warnings', vehiclesUsed: 'Vehicles in use',
    seatsUsed: 'Seat usage', personDay: 'Person day view', noShift: 'no shift',
  },
};
