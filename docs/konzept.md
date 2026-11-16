# Mission Briefer – Konzept Fahrdienst-Disposition

Stand: 2026-11-16 · Status: Entwurf v0.1

## 1. Ziel & Rahmen

Web-basierte Disposition von Personentransporten (und Material) für Veranstaltungen eines Veranstalters.

| Rahmenbedingung | Wert |
|---|---|
| Personen | bis 300 |
| Fahrzeuge | bis 30 |
| Parallele Veranstaltungen | 1–3 |
| Mandanten | 1 Veranstalter (kein SaaS) |
| Planung | zentral durch Disponenten |
| Self-Service | Fahrer & Mitfahrer (Web/PWA) |
| Live-Funktionen | nur ohne laufende Zusatzkosten |

**Grundprinzip:** Disponent plant manuell, System schlägt vor und prüft Konflikte. Keine Black-Box-Optimierung im MVP.

## 2. Rollen

| Rolle | Rechte |
|---|---|
| Admin | Stammdaten, Benutzer, Einstellungen |
| Disponent | Veranstaltungen, Personen, Dienste, Fahrzeuge, Fahrten, Transportarten planen |
| Fahrer | eigene Fahrten sehen, Status melden, Verspätung melden |
| Mitfahrer | eigene Fahrten/Dienste sehen, Dienste korrigieren, Fahrt anfragen |

Eine Person kann Fahrer **und** Mitfahrer sein (Fahrer ist Fähigkeit, keine eigene Personengruppe).

## 3. Datenmodell

```
Veranstaltung 1─n Dienst n─1 Ort
Veranstaltung n─n Person (Teilnahme: Prio, Start-/Endort)
Person n─n Team ; Team n─n Dienst (Vorlage)
Person 1─n Unterbringung (pro Nacht) n─1 Ort
Fahrzeug 1─n Verfügbarkeit
Fahrt n─1 Fahrzeug, n─1 Fahrer(Person), 1─n Stopp n─1 Ort
Fahrt 1─n Beförderung (Person, Einstiegs-Stopp, Ausstiegs-Stopp)
Transportbedarf (abgeleitet) → erfüllt durch Beförderung | Alternative
Ort n─n Ort : Distanzmatrix (Dauer je Transportart)
```

### 3.1 Entitäten

**Ort** – Name, Adresse, Lat/Lng, Typ (Unterkunft, Einsatzort, Depot, Bahnhof, …), Rüstzeit-Puffer (Min.)

**Veranstaltung** – Name, von, bis, Standard-Puffer, Zeitzone

**Person** – Name, Telefon, E-Mail, Führerscheinklassen (B, BE, C, CE, C1…), Login
**Teilnahme** (Person × Veranstaltung) – Prio (1 = hoch, z. B. Technik), Startort + frühester Abreisezeitpunkt, Endort + spätester Ankunftszeitpunkt (optional)
**Unterbringung** – Person, Nacht (Datum), Ort. *Default: gleiche Unterkunft für alle Nächte, pro Nacht überschreibbar.*

**Team** – Name, Farbe. Dienste können einem Team zugewiesen werden → alle Mitglieder erhalten den Dienst; individuelle Abweichung möglich.

**Dienst** – Veranstaltung, Datum, Beginn, Ende, Einsatzort, Anmerkungen, Team(s)/Person(en)
**Dienstzuweisung** – Person × Dienst, ggf. abweichende Beginn/Ende (durch Selbstkorrektur), Änderungshistorie

**Fahrzeug** – Name, Kennzeichen, Typ (PKW, Transporter, LKW, Anhänger), Sitzplätze (ohne Fahrer), Laderaum (optional), erforderliche Führerscheinklasse, Startpunkt (Depot-Ort), Anhängerkupplung ja/nein
**Verfügbarkeit** – Fahrzeug, von, bis
**Anhänger** ist Fahrzeug mit `sitzplaetze = 0`, wird einer Fahrt als Zusatz an ein Zugfahrzeug gehängt (Prüfung: Kupplung, Führerschein BE/CE).

**Fahrt** – Fahrzeug, (Anhänger), Fahrer, Status (geplant, bestätigt, unterwegs, erledigt, storniert), Notiz
**Stopp** – Fahrt, Reihenfolge, Ort, geplante Ankunft/Abfahrt, tatsächliche Zeiten (optional)
**Beförderung** – Fahrt, Person, Einstieg-Stopp, Ausstieg-Stopp

**Transportart** (vom Disponent konfiguriert) – Fahrzeug intern, Fußweg, ÖPNV, Taxi, Shuttle (extern) …; je Art: Kosten-Hinweis, benötigt Disposition ja/nein
**Distanz** – Von-Ort, Nach-Ort, Transportart, Dauer (Min.), Quelle (manuell | Routing-API). *Fußweg* = Distanzeintrag mit Transportart „Fuß“; Orte unter X Min. Fußweg werden automatisch als „kein Transport nötig“ behandelt (Schwelle konfigurierbar, Default 15 Min.).

**Fahrtanfrage** – Person, Startort, Zielort, gewünschte Ankunft, Status (offen, eingeplant, abgelehnt), Kommentar

### 3.2 Transportbedarf (Kernlogik)

Das System **leitet Bedarfe automatisch ab** aus Teilnahme + Diensten + Unterbringung:

1. **Anreise:** Startort → Einsatzort des ersten Dienstes, Ankunft ≤ Dienstbeginn − Puffer
2. **Zwischen Diensten:** wenn Einsatzort wechselt
3. **Tagesende:** letzter Einsatzort des Tages → Unterkunft der Nacht
4. **Tagesbeginn:** Unterkunft → erster Einsatzort des Tages
5. **Abreise:** letzter Einsatzort → Endort, Abfahrt ≥ Dienstende
6. **Manuelle Anfragen** (Self-Service)

Bedarf entfällt, wenn Fußweg ≤ Schwelle oder Disponent eine Alternative (ÖPNV, Taxi, eigene Anreise) zuweist.

Jeder Bedarf hat Status: **offen / gedeckt / Konflikt**. Änderung eines Dienstes ⇒ Bedarfe neu berechnen ⇒ betroffene Beförderungen werden als Konflikt markiert und Disponent + Fahrer benachrichtigt.

## 4. Konfliktprüfung

| Prüfung | Schwere |
|---|---|
| Bedarf ohne Deckung | Fehler (sortiert nach Prio, Zeitpunkt) |
| Ankunft nach Dienstbeginn − Puffer | Fehler |
| Sitzplätze überbucht | Fehler |
| Fahrzeug außerhalb Verfügbarkeit / doppelt gebucht | Fehler |
| Fahrer ohne passende Führerscheinklasse | Fehler |
| Fahrer hat zeitgleich Dienst / anderer Fahrt | Fehler |
| Fahrzeug startet nicht dort, wo es zuletzt stand | Warnung |
| Fahrer-Ruhezeit < 11 h / Lenkzeit (LKW) | Warnung |
| Wartezeit Mitfahrer > X Min. | Hinweis |

**Prio-Regel:** Bei Engpässen werden höher priorisierte Personen in Vorschlägen zuerst bedient und in der Liste offener Bedarfe oben angezeigt.

## 5. Kern-Workflows

### Disponent
1. Veranstaltung anlegen → Orte erfassen (Geocoding über Nominatim/OSM, kostenlos)
2. Personen importieren (CSV/Excel) → Teams, Unterbringung, Start-/Endorte
3. Dienste anlegen, Teams zuweisen (Wochenraster, Kopieren von Tagen)
4. Distanzmatrix pflegen (manuell; optional „berechnen“ per OSRM)
5. **Dispo-Board:** Zeitachse (x) × Fahrzeuge (y); links Liste offener Bedarfe; Bedarf per Drag&Drop auf Fahrt ziehen oder neue Fahrt erzeugen
6. **Vorschlag „Bündeln“:** Bedarfe mit gleichem Ziel und ähnlicher Zeit (± 30 Min.) gruppieren → Fahrt-Vorschlag mit passendem freien Fahrzeug
7. Fahrten veröffentlichen → Fahrer/Mitfahrer benachrichtigt

### Fahrer (PWA)
- Heute/Morgen: Fahrten mit Fahrzeug, Stopps, Mitfahrer (Name, Telefon), Zielort, Ankunftszeit
- Navigation: Deep-Link in Google Maps / Apple Maps (kostenlos)
- Status: „Losgefahren“, „Angekommen“, „Verspätung +X Min.“, „Person nicht erschienen“

### Mitfahrer (PWA)
- Meine Dienste + Meine Fahrten (Abholort, Zeit, Fahrer, Fahrzeug, Kontakt)
- **Dienstzeit korrigieren** – direkt wirksam; System berechnet Bedarfe neu, betroffene Fahrten → Konflikt, Disponent + Fahrer werden benachrichtigt; Änderung im Audit-Log
- **Fahrt anfragen** – Start, Ziel, gewünschte Ankunft → erscheint als Bedarf im Dispo-Board

## 6. Live-Funktionen (ohne Zusatzkosten)

| Funktion | Umsetzung |
|---|---|
| Aktualisierung Board/App | WebSocket (Socket.IO) im eigenen Server |
| Benachrichtigungen | Web Push (VAPID, kostenlos) + E-Mail; **kein SMS** |
| Verspätung/Status | Fahrer-Buttons, kein GPS-Tracking |
| Standort (optional, Phase 3) | Browser-Geolocation nur bei aktiver Fahrt, Übertragung per WebSocket. Einschränkung: im iOS-Hintergrund nicht zuverlässig |

## 7. Tech-Stack (NodeJS)

| Bereich | Wahl | Begründung |
|---|---|---|
| Sprache | TypeScript durchgängig | gemeinsame Typen Front/Back |
| Backend | NestJS (Alternative: Fastify + tRPC) | Struktur, Auth, WebSockets integriert |
| DB | PostgreSQL + Prisma | relationale Daten, Zeitbereiche, Migrationen |
| Frontend | React + Vite, Mantine/MUI | Dispo-Board-Komponenten verfügbar |
| Board | FullCalendar Resource Timeline (Lizenz prüfen) oder vis-timeline (MIT) | Zeitachse × Fahrzeug |
| Karte | Leaflet + OpenStreetMap-Tiles | kostenlos (Fair-Use) |
| Geocoding | Nominatim (öffentlich, 1 req/s) | reicht für ~100 Orte |
| Routing (optional) | OSRM öffentliche Demo-Instanz oder selbst gehostet (Docker) | kostenlos; Ergebnisse in Distanzmatrix cachen |
| App | PWA (installierbar, Push, Offline-Lesen) | eine Codebasis; native App nicht nötig |
| Auth | Magic-Link per E-Mail für Fahrer/Mitfahrer, Passwort+2FA für Disponenten | kein Passwort-Management für 300 Helfer |
| Hosting | 1 VPS (Docker Compose: app, postgres, ggf. osrm) | Lastprofil sehr gering |

**Architektur:** Monorepo (pnpm workspaces): `apps/api`, `apps/web` (Disponent + PWA in einer App mit rollenbasiertem Routing), `packages/shared` (Typen, Validierung mit zod, Bedarfslogik).

Bedarfs- und Konfliktlogik als reine Funktionen in `packages/shared` → gut testbar, im Board auch clientseitig für Sofort-Feedback nutzbar.

## 8. MVP-Schnitt

**Phase 1 – MVP (Disponent)**
- Stammdaten: Veranstaltung, Orte, Personen (CSV-Import), Teams, Dienste, Fahrzeuge, Verfügbarkeit
- Distanzmatrix manuell, Fußweg-Schwelle
- Bedarfsableitung + Konfliktprüfung
- Dispo-Board manuell (Drag&Drop)
- Export: Fahrplan pro Fahrer/Fahrzeug als PDF/Druckansicht

**Phase 2 – Self-Service**
- PWA für Fahrer und Mitfahrer, Magic-Link-Login
- Dienstkorrektur, Fahrtanfragen
- Web Push, Live-Updates

**Phase 3 – Komfort**
- Bündelungsvorschläge, OSRM-Integration
- Alternativen (ÖPNV/Taxi) mit Kostenübersicht
- Optional Standortfreigabe, Lenkzeitprüfung LKW
- Später ggf. automatische Optimierung (OR-Tools)

## 9. Offene Punkte

1. Datenschutz: Telefonnummern für Mitfahrer sichtbar? Aufbewahrungsfrist nach Veranstaltung?
2. Material/Fracht im MVP oder später?
3. Wer darf Dienste anlegen – nur Disponent oder auch Teamleiter?
4. Grenzen der Selbstkorrektur (z. B. nur ± 2 h, nicht < 2 h vor Beginn)?
5. Mehrsprachigkeit (DE/EN) nötig?
6. Fahrer-Ruhezeiten: harte Regel oder nur Warnung?
