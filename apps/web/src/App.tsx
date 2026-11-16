import { AppShell, Burger, Group, NavLink, Select, SegmentedControl, Text, Button, Center, Loader } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IconLayoutDashboard, IconRoute, IconTruck, IconUsers, IconCalendarTime, IconBed, IconMapPin, IconClock, IconCalendarEvent, IconChartBar,
} from '@tabler/icons-react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, useEvents } from './api';
import { setLanguage } from './i18n';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { BoardPage } from './pages/Board';
import { VehicleUsagePage } from './pages/VehicleUsage';
import { PeoplePage } from './pages/People';
import { ShiftsPage } from './pages/Shifts';
import { LodgingPage } from './pages/Lodging';
import { VehiclesPage } from './pages/Vehicles';
import { LocationsPage } from './pages/Locations';
import { DistancesPage } from './pages/Distances';
import { EventsPage } from './pages/Events';
import { PrintPage } from './pages/Print';

export function App() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<{ email: string; role: string }>('GET', '/auth/me') });
  if (me.isLoading)
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  if (me.isError) return <LoginPage />;
  return (
    <Routes>
      <Route path="/e/:eventId/print" element={<PrintPage />} />
      <Route path="/*" element={<Shell email={me.data!.email} />} />
    </Routes>
  );
}

function Shell({ email }: { email: string }) {
  const [opened, { toggle, close }] = useDisclosure();
  const { t, i18n } = useTranslation();
  const events = useEvents();
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const match = loc.pathname.match(/^\/e\/([^/]+)/);
  const eventId = match?.[1];

  const eventItems = [
    { to: 'dashboard', label: t('nav.dashboard'), icon: IconLayoutDashboard },
    { to: 'board', label: t('nav.board'), icon: IconRoute },
    { to: 'usage', label: t('nav.vehicles'), icon: IconChartBar },
    { to: 'people', label: t('nav.people'), icon: IconUsers },
    { to: 'shifts', label: t('nav.shifts'), icon: IconCalendarTime },
    { to: 'lodging', label: t('nav.lodging'), icon: IconBed },
  ];
  const globalItems = [
    { to: '/vehicles', label: t('nav.masterVehicles'), icon: IconTruck },
    { to: '/locations', label: t('nav.locations'), icon: IconMapPin },
    { to: '/distances', label: t('nav.distances'), icon: IconClock },
    { to: '/events', label: t('nav.events'), icon: IconCalendarEvent },
  ];

  const logout = async () => {
    await api('POST', '/auth/logout');
    qc.clear();
    window.location.href = '/';
  };

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 230, breakpoint: 'sm', collapsed: { mobile: !opened } }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={700} visibleFrom="xs">{t('app.title')}</Text>
            <Select
              size="sm"
              w={220}
              placeholder={t('app.event')}
              data={events.data?.map((e) => ({ value: e.id, label: e.name })) ?? []}
              value={eventId ?? null}
              onChange={(v) => v && nav(`/e/${v}/${loc.pathname.split('/')[3] ?? 'dashboard'}`)}
              allowDeselect={false}
            />
          </Group>
          <Group wrap="nowrap" gap="xs">
            <SegmentedControl size="xs" value={i18n.language} onChange={(v) => setLanguage(v as 'de' | 'en')} data={['de', 'en']} />
            <Text size="sm" c="dimmed" visibleFrom="md">{email}</Text>
            <Button size="xs" variant="subtle" onClick={logout}>{t('app.logout')}</Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        {eventId &&
          eventItems.map((i) => (
            <NavLink
              key={i.to}
              component={Link}
              to={`/e/${eventId}/${i.to}`}
              label={i.label}
              leftSection={<i.icon size={18} />}
              active={loc.pathname.endsWith(`/${i.to}`)}
              onClick={close}
            />
          ))}
        <Text size="xs" c="dimmed" mt="md" mb={4} px="sm">Stammdaten</Text>
        {globalItems.map((i) => (
          <NavLink key={i.to} component={Link} to={i.to} label={i.label} leftSection={<i.icon size={18} />} active={loc.pathname === i.to} onClick={close} />
        ))}
      </AppShell.Navbar>
      <AppShell.Main>
        <Routes>
          <Route path="/e/:eventId/*" element={<EventRoutes />} />
          <Route path="/vehicles" element={<VehiclesPage />} />
          <Route path="/locations" element={<LocationsPage />} />
          <Route path="/distances" element={<DistancesPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route
            path="*"
            element={
              events.isLoading ? <Loader /> : events.data?.[0] ? <Navigate to={`/e/${events.data[0].id}/dashboard`} replace /> : <Navigate to="/events" replace />
            }
          />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}

function EventRoutes() {
  const { eventId } = useParams();
  return (
    <Routes>
      <Route path="dashboard" element={<DashboardPage eventId={eventId!} />} />
      <Route path="board" element={<BoardPage eventId={eventId!} />} />
      <Route path="usage" element={<VehicleUsagePage eventId={eventId!} />} />
      <Route path="people" element={<PeoplePage eventId={eventId!} />} />
      <Route path="shifts" element={<ShiftsPage eventId={eventId!} />} />
      <Route path="lodging" element={<LodgingPage eventId={eventId!} />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
}
