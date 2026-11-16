# Mission Briefer – Konzept Fahrdienst-Disposition

Stand: 2026-11-16 · Status: v0.4 – Phase 1 umgesetzt

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
| Teamleiter | wie Mitfahrer + Dienste der eigenen Teams anlegen/ändern |
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
| Fahrer-Ruhezeit < 11 h / Lenkzeit (LKW) | Warnung (nie blockierend) |
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
- **Dienstzeit korrigieren** – direkt wirksam (gesperrt ab 2 h vor Beginn, konfigurierbar); System berechnet Bedarfe neu, betroffene Fahrten → Konflikt, Disponent + Fahrer werden benachrichtigt; Änderung im Audit-Log
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
- Dienstkorrektur, Fahrtanfragen, Positionskorrektur (Fahrt verpasst)
- Teamleiter-Rolle
- Mehrsprachigkeit DE/EN (i18n-Grundgerüst bereits in Phase 1)
- Web Push, Live-Updates

**Phase 3 – Komfort**
- Bündelungsvorschläge, OSRM-Integration
- Alternativen (ÖPNV/Taxi) mit Kostenübersicht
- Optional Standortfreigabe, Lenkzeitprüfung LKW
- Später ggf. automatische Optimierung (OR-Tools)

## 9. Entscheidungen

| # | Thema | Entscheidung |
|---|---|---|
| 1 | Telefonnummern | Fahrer ↔ Mitfahrer einer gemeinsamen Fahrt gegenseitig sichtbar |
| 2 | Material/Fracht | später (nach Phase 3) |
| 3 | Dienste anlegen | Disponent **und Teamleiter** (nur für eigene Teams) → neue Rolle |
| 4 | Selbstkorrektur Dienste | frei, aber gesperrt ab X h vor Dienstbeginn (konfigurierbar, Default 2 h); danach nur über Disponent |
| 4b | Positionskorrektur | Mitfahrer kann jederzeit melden „Ich bin jetzt an Ort Y“ (Fahrt verpasst, woanders) → siehe 9.1 |
| 5 | Sprachen | DE + EN (i18n von Beginn an, Sprache pro Benutzer) |
| 6 | Ruhezeiten Fahrer | nur Warnung |

**Rolle Teamleiter:** Rechte wie Mitfahrer + Dienste für eigene Teams anlegen/ändern. Änderungen lösen dieselbe Bedarfsneuberechnung aus wie beim Disponenten.

### 9.1 Positionskorrektur / Fahrt verpasst

- Mitfahrer (PWA): Button „Fahrt verpasst / anderer Standort“ → Ort wählen (Liste oder aktueller GPS-Standort → nächster bekannter Ort) + Zeitpunkt
- Alternativ Fahrer meldet „Person nicht erschienen“
- Folge: Beförderung wird als *nicht erfolgt* markiert; System erzeugt neuen **Ad-hoc-Bedarf** (aktueller Ort → nächster Dienstort bzw. Unterkunft) mit Status *dringend*
- Disponent wird sofort per Push benachrichtigt, Bedarf steht oben im Board
- Fällt in **Phase 2** (Self-Service)

| 6b | Sperrfrist Selbstkorrektur | 2 h vor Dienstbeginn (konfigurierbar) |
| 7 | Datenaufbewahrung | Personenbezogene Daten werden 90 Tage nach Veranstaltungsende automatisch gelöscht bzw. anonymisiert (Job, konfigurierbar) |

## 10. UX-Leitlinien

**Leitprinzip:** Einfachheit vor Funktionsumfang. Fahrer und Mitfahrer müssen die App **ohne Schulung** bedienen können; Disponenten und Teamleiter arbeiten mit **Massenbearbeitung statt Einzelformularen**.

### 10.1 Fahrer & Mitfahrer (PWA, Mobile-first)

- **Startseite = „Was ist als Nächstes?“**: eine Karte mit nächster Fahrt (Uhrzeit groß, Abholort, Fahrer/Fahrzeug, Anruf-Button) bzw. nächstem Dienst. Darunter chronologische Liste heute/morgen.
- Max. **3 Tabs**: *Heute* · *Meine Dienste* · *Hilfe/Problem*
- **Problem-Button** immer erreichbar: „Fahrt verpasst“, „Bin woanders“, „Verspätung“, „Dienst geändert“ – je 1–2 Taps, Ort per GPS vorausgewählt
- Fahrer: pro Stopp eine Zeile mit großen Buttons *Navigation* / *Angekommen* / *Person fehlt*; Mitfahrerliste mit Anruf-Button
- Login per Magic-Link, danach dauerhaft angemeldet; keine Passwörter
- Große Touch-Ziele, hoher Kontrast (draußen, Sonne), funktioniert offline lesend
- Änderungen werden **hervorgehoben** („Neu: Abholung jetzt 7:15 statt 7:30“) und per Push gemeldet

### 10.2 Teamleiter – Dienste für das Team

- **Team-Dienstplan als Raster:** Zeilen = Teammitglieder, Spalten = Tage
- **Schnellerfassung:** Tage markieren (Mehrfachauswahl, z. B. Mo–Fr) + Uhrzeit + Einsatzort → „Für ganzes Team übernehmen“
- Einzelne Personen/Tage per Klick abweichend setzen oder ausnehmen
- **Vorlagen** („Frühschicht Halle A 7–15 Uhr“) und „Vortag kopieren“
- Sofortige Rückmeldung: „12 neue Transportbedarfe, 2 Konflikte“

### 10.3 Disponent – Tabellen mit Schnellauswahl

- **Unterbringungs-Matrix:** Zeilen = Personen (filterbar nach Team), Spalten = Nächte; Zellen per Dropdown/Tippen mit Autovervollständigung; Mehrfachauswahl + „für Auswahl setzen“; Zeile/Spalte füllen (wie Excel ziehen); Copy/Paste aus Excel
- Gleiches Muster für **Personen-Stammdaten** (Start-/Endort, Prio, Teams, Führerschein): editierbare Tabelle statt Formulare, CSV-Import/Export
- Spreadsheet-Komponente: z. B. AG Grid Community oder Glide Data Grid (MIT)

### 10.4 Übersichten

- **Fahrzeugbelegung:** Zeitleiste (Fahrzeuge × Zeit), Balken = Fahrten, Farbe = Auslastung (frei / teilweise / voll / überbucht), Hover: Fahrer, Mitfahrer, Route; graue Bereiche = nicht verfügbar
- **Ampel-Dashboard pro Tag:** offene Bedarfe, Konflikte, freie Plätze, Fahrzeuge im Einsatz
- **Personen-Tagesansicht:** pro Person Dienste + Fahrten + Unterkunft in einer Zeile – zeigt Lücken sofort
- Druck-/PDF-Ansicht je Fahrzeug und je Tag (Fallback ohne Handy)

## 11. Umsetzungsnotizen Phase 1 (Abweichungen)

- **Backend: Fastify statt NestJS** – weniger Boilerplate bei dieser Größe; Struktur über Route-Module + `packages/shared`.
- **Dienst = eine Zeile pro Person** (statt Dienst + Zuweisung). Team-Dienste werden per Massenaktion für alle Mitglieder angelegt, `teamId` merkt die Herkunft. Einfacher für Selbstkorrektur (Phase 2).
- **Orte, Fahrzeuge, Fahrzeiten sind global** (über Veranstaltungen hinweg wiederverwendbar).
- **Bündeln**: im MVP manuell – mehrere Bedarfe ankreuzen und gemeinsam auf ein Fahrzeug ziehen; Fahrt-Editor schlägt passende offene Bedarfe vor.
- **Unterkunft vor dem ersten Dienst** wird nicht angefahren (Anreise geht direkt zum ersten Einsatzort).
- **Datenlöschung nach 90 Tagen** und Sperrfrist 2 h: Felder vorhanden, Umsetzung mit Phase 2.
- Vorlagen im Dienstplan werden im Browser gespeichert (pro Gerät).
- Kein Excel-Fill-Handle (Ziehen zum Füllen); stattdessen Mehrfachauswahl + „für Auswahl setzen“ und Einfügen aus Excel.

## 12. Offene Punkte

- keine
