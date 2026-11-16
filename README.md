# KRK Mission Briefer

Fahrdienst-Disposition für Veranstaltungen. Konzept: [docs/konzept.md](docs/konzept.md).

## Stand: Phase 1 (Disponent)

- Stammdaten: Veranstaltungen, Teams, Orte, Fahrzeuge (+ Verfügbarkeit), Fahrzeiten-Matrix (Fahrzeug/Fuß/ÖPNV)
- **Personen-Tabelle** mit Inline-Bearbeitung und Import per Copy & Paste aus Excel
- **Dienstplan-Raster** (Personen × Tage): Zellen ziehen, Dienst für Auswahl/ganzes Team setzen, Vorlagen, Vortag kopieren
- **Unterbringungs-Matrix** (Personen × Nächte): Schnellauswahl, Einfügen aus Excel, Standard-Unterkunft als Fallback
- Automatische **Bedarfsableitung** (Anreise, Morgens, Wechsel, Abends, Abreise) inkl. Fußweg-Schwelle
- **Dispo-Board**: Zeitleiste je Fahrzeug, Bedarfe per Drag & Drop (einzeln oder mehrere), Fahrt-Editor mit Vorschlägen
- **Konfliktprüfung** (Verspätung, Überbuchung, Führerschein, Doppelbuchung, Verfügbarkeit, Ruhezeit-Warnung, Standort …)
- Übersicht pro Tag (Ampel), Personen-Tagesansicht, Fahrzeugbelegung, Druckansicht je Fahrzeug
- Deutsch/Englisch

## Struktur

```
packages/shared   Domänenlogik (Bedarfe, Konflikte), Typen, Validierung (zod) – mit Tests
apps/api          Fastify + Prisma (PostgreSQL)
apps/web          React + Mantine (Vite)
```

## Entwicklung

Voraussetzungen: Node 22, pnpm 10, PostgreSQL 16.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # DATABASE_URL etc. anpassen
pnpm --filter @mb/api db:deploy             # Migrationen
pnpm --filter @mb/api db:seed               # Demo-Daten (Login admin@example.com / admin)
pnpm dev                                    # API :3000, Web :5173
pnpm test                                   # Unit- + API-Tests (API-Tests brauchen DB, setzen Demo-Daten neu!)
```

Produktion: `pnpm --filter @mb/web build`, dann `pnpm --filter @mb/api start` – die API liefert das gebaute Frontend mit aus.
Beim ersten Start wird ein Admin aus `ADMIN_EMAIL`/`ADMIN_PASSWORD` angelegt.
