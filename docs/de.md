# Gecko in.touch2

Steuern Sie einen Spa mit Gecko-Steuerung und **in.touch2**-WLAN-Modul aus
Gladys: Wassertemperatur, Sollwert, Pumpen, Gebläse, Wasserfall, Licht und
Wasserpflegemodus.

Die Integration kommuniziert **direkt mit dem in.touch2-Modul in Ihrem
lokalen Netzwerk** (UDP-Port 10022), wie es die offizielle in.touch2-App zu
Hause tut. Kein Cloud-Konto, kein Passwort: Der Spa bleibt auch ohne Internet
über Gladys steuerbar.

## Voraussetzungen

- Ein Spa mit Gecko-Steuerung (in.YT, in.XE, in.YJ, in.XM, in.YE…) und
  in.touch2-Modul, bereits gekoppelt und mit der in.touch2-App funktionsfähig.
- Das in.touch2-Modul (die Box in der Nähe Ihres Routers) im selben lokalen
  Netzwerk wie Gladys.
- Gladys 5.1 oder neuer.

## Einrichtung

1. Installieren Sie die Integration und öffnen Sie den Tab **Erkennung**: Die
   in.touch2-Module im Netzwerk antworten innerhalb weniger Sekunden. Fügen
   Sie Ihren Spa hinzu.
2. Nicht gefunden? Vergeben Sie dem in.touch2-Modul im Router eine feste
   Adresse (DHCP-Reservierung), tragen Sie sie im Tab **Konfiguration** unter
   **Adresse des in.touch2-Moduls** ein, speichern Sie und öffnen Sie den Tab
   „Erkennung“ erneut.
3. **Nach Spas suchen** (Tab Konfiguration) führt dieselbe Suche aus und zeigt,
   was geantwortet hat; **Verbindung testen** prüft jeden bekannten Spa und
   zeigt das Funksignal zwischen Modul und Spa.

## Was Sie erhalten

Ein Gerät pro Spa, dessen Funktionen davon abhängen, was an Ihre Steuerung
angeschlossen ist:

| Funktion            | Beschreibung                                                       |
| ------------------- | ------------------------------------------------------------------ |
| Wassertemperatur    | Vom Spa gemessen (°C, von Gladys umgerechnet, wenn Sie °F nutzen)  |
| Solltemperatur      | Einstellbar im Bereich Ihres Spas (15–40 °C)                       |
| Heizung             | Ob die Heizung läuft                                               |
| Pumpe 1…5           | Ein/Aus (Ein = hohe Geschwindigkeit)                               |
| Gebläse, Wasserfall | Ein/Aus                                                            |
| Licht, Licht 2      | Ein/Aus                                                            |
| Umwälzpumpe         | Nur lesen                                                          |
| Ozon                | Nur lesen                                                          |
| Wasserpflegemodus   | Abwesend, Standard, Energiesparen, Super-Energiesparen, Wochenende |
| Funksignal          | Qualität der Funkverbindung zwischen in.touch2-Modul und Spa       |

Die Werte werden vom Spa gesendet, sobald sie sich ändern: keine Abfrage.

## Szenen

Auslöser:

- **Spa-Wasser auf Temperatur** — das Wasser hat den Sollwert erreicht. Die
  folgenden Aktionen können `{{triggerEvent.data.temperature}}` lesen.
- **Spa-Heizung gestartet oder gestoppt** — filtern Sie nach gestartet
  und/oder gestoppt.
- **Spa-Verbindung verloren oder zurück** — das in.touch2-Modul antwortet
  nicht mehr oder wieder.

Aktionen:

- **Spa-Temperatur einstellen** — gibt die tatsächlich angewendete
  Temperatur zurück.
- **Wasserpflegemodus einstellen**.
- **Pumpe oder Licht steuern** — aus, langsam oder schnell. Gibt zurück, ob
  der Spa dieses Gerät hat.
- **Düsen und Licht des Spas stoppen** — gibt zurück, wie viele Geräte liefen.

## Dashboard

Das Widget **Spa-Übersicht** zeigt Wasser- und Solltemperatur (live), die
Heizung, den Wasserpflegemodus und die Verbindung, mit Schaltflächen zum
Schalten des Lichts, Ändern der Temperatur und Stoppen aller Geräte. Bei
mehreren Spas wählen Sie einen in den Widget-Einstellungen.

## Fehlerbehebung

- **Nichts gefunden** — das Modul antwortet auf Broadcasts an UDP-Port 10022.
  Manche Router oder Mesh-Systeme filtern sie: Tragen Sie die Moduladresse in
  der Konfiguration ein. Prüfen Sie, ob die offizielle App im selben WLAN
  funktioniert.
- **Nicht erreichbar** — das Modul antwortet nicht mehr (Strom, WLAN). Die
  Integration versucht es jede Minute erneut.
- **Orangefarbener Punkt am Badge** — das Modul antwortet, aber seine
  Funkverbindung zum Spa ist instabil: Stellen Sie das Modul näher an den Spa.
- **Nicht unterstützte Steuerung** — die Protokolle nennen die Plattform und
  die Speicherkarten-Versionen: Eröffnen Sie damit ein Issue auf der
  Projektseite.

Bei manchen Firmware-Versionen kann nur eine Anwendung den Spa gleichzeitig
steuern: Verliert die offizielle App die Verbindung, während Gladys verbunden
ist, ist das normal.
