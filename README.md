# NFC-Visitenkarte als Chat

Die Karte öffnet direkt einen einzelnen Chat unter `/c/{kartenkennung}`. Es gibt keine Profilansicht, keinen QR-Bereich und keine separaten Kontakt- oder Buchungsseiten. Kontakt, Fragen und Terminwünsche werden im Gespräch behandelt.

## Lokal starten

Node.js 20.9 oder neuer wird benötigt.

```powershell
npm install
npm run dev
```

Danach `http://localhost:3000` öffnen. Die Startseite leitet zur mummentum-Variante unter `/c/vincent` weiter. Florian liegt unter `/c/florian`; das neutrale Beispielsprofil bleibt unter `/c/demo-karte` erreichbar.

## Auf dem Handy als App öffnen

Vincents Chat stellt ein Web-App-Manifest und ein mummentum-Icon bereit. Über eine öffentlich erreichbare HTTPS-Adresse kann `/c/vincent` zum Home-Bildschirm hinzugefügt und danach ohne Browserleiste gestartet werden:

- **iPhone:** Den Chat in Safari öffnen, „Teilen“ → „Zu Home-Bildschirm hinzufügen“ wählen und „Als Web-App öffnen“ aktivieren.
- **Android:** Den Chat in Chrome öffnen, im Menü „Zum Home-Bildschirm hinzufügen“ → „Installieren“ wählen.

Beim Aufruf als gewöhnlicher Browser-Tab bleibt die Browserleiste sichtbar. Die App benötigt für Chat und Terminbuchung weiterhin eine Internetverbindung.

## Chatverhalten

- **Fragen:** Veröffentlichtes Wissen wird direkt im Chat beantwortet. Für offene Fragen kann ein serverseitiger Modellanbieter über `.env.local` konfiguriert werden. Ohne Modell antwortet der Chat aus passenden freigegebenen Fragen und Antworten und sagt bei Wissenslücken klar, dass keine bestätigte Antwort vorliegt.
- **Kontakt:** Auf Wunsch zeigt der Chat freigegebene Kontaktdaten und eine vCard zum Speichern als Teil der Chatnachricht.
- **Termin:** Bei Florian zeigt der Chat freie Zeiten, das Buchungsformular und die Bestätigung direkt in einer Chatnachricht. Die Verfügbarkeit kommt von Schuneras Buchungs-API. Beim Absenden gehen die Formulardaten an Schunera; Florian bestätigt den Termin anschließend per E-Mail. Vincents Cal.com-Kalender wird direkt in der Chatnachricht eingebettet und wickelt die Buchung über den bestehenden mummentum-Terminablauf ab.

Der Chat startet ohne Modellaufruf. Das LLM darf keine URLs oder Buchungen erfinden: Aktionsvorschläge werden anhand veröffentlichter Kontakt-, Angebots- und Buchungsdaten serverseitig geprüft.

## Inhalte konfigurieren

Profile, Kartenkennungen, Kontaktfelder, Social-Media-Links, Angebote, Buchungslinks und freigegebene Wissenseinträge stehen in [`data/profile.json`](./data/profile.json). Das Profil `florian` enthält die öffentlich belegten Unternehmens- und Profildaten von Schunera und bindet die Buchung auf `schunera.de` als Chatablauf ein. Das Profil `vincent` enthält die mummentum-Angaben, wählt das FUSION-Design profilbezogen aus und bettet den Cal.com-Kalender `mummentum/30min` ein. Beispieldaten vor Veröffentlichung ersetzen. Die Datei ist in dieser Umsetzung die redaktionelle Quelle; Änderungen werden mit einem Anwendungs-Deployment veröffentlicht, die Kartenkennung kann dabei stabil bleiben.

## Modellzugang

`.env.example` kopieren und als `.env.local` speichern. `LLM_API_KEY` setzen; `LLM_MODEL` ist auf `gpt-6-luna` vorbelegt. `LLM_BASE_URL` kann auf einen kompatiblen Anbieter mit Responses-API gesetzt werden. Schlüssel bleiben auf dem Server.

Vor einer Antwort prüft das Modell, ob die Frage ausschließlich das Profil, das Unternehmen, dessen Produkte oder Leistungen sowie Kontakt und Terminbuchung betrifft. Andere Anliegen werden höflich abgelehnt. Die Antwortgenerierung nutzt GPT-6 Luna mit mittlerer Reasoning-Stufe. Websuche ist nur für Schunera-Profile aktiviert und durch `allowed_domains: ["schunera.de"]` auf Schunera einschließlich Subdomains begrenzt. Quellen erscheinen als anklickbare Links direkt unter der Chatantwort.

Pro Anfrage werden höchstens acht Chatnachrichten und die freigegebenen Informationen des zugehörigen Profils übertragen. Die Anwendung speichert Gesprächsverläufe nicht dauerhaft. Die Responses-Anfragen setzen `store: true` wie in der Playground-Konfiguration; OpenAI speichert API-Antworten dadurch mindestens 30 Tage, vorbehaltlich der für das Konto geltenden Aufbewahrungsregeln und Ausnahmen. Beim ersten Chatversuch setzt der Server ein kurzlebiges HttpOnly-Cookie für das Nachrichtenlimit; es läuft nach 30 Minuten ab. Das eingebaute Limit ist pro Sitzung und Serverprozess und ersetzt keinen verteilten Schutz vor Missbrauch.

## Vor einem öffentlichen Pilot

- Die NFC-Kennung mit einer stabilen HTTPS-Domain auf eine Testkarte schreiben und auf den vereinbarten iPhone- und Android-Geräten prüfen.
- Echte Profildaten und freigegebene Inhalte einsetzen.
- Kalenderanbieter, Terminart und Buchungsbestätigung je Profil prüfen. Florians Integration nutzt Schuneras Termin-API und Formularfelder; Vincents Profil bettet den mummentum-Cal.com-Kalender im Chat ein.
- Impressum, Datenschutz, LLM-Datenverarbeitung, Aufbewahrung und Hosting prüfen. Rechtliche Infoseiten und Administrationsoberfläche sind in dieser Chat-only-Version nicht enthalten.
- Adminbereich mit Rollen/MFA, Datenbank, verteiltes Missbrauchslimit, Logs, Backups und Monitoring für den Produktionsbetrieb ergänzen.
- Geräte-, Inhalts-, Sicherheits- und Wiederherstellungstests vor Freigabe durchführen.
