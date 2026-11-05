# modell-router

Leitet jede Anfrage automatisch an das Modell mit dem besten Preis-Leistungs-Verhältnis.

Bei jeder neuen Nachricht stuft Haiku sie kurz ein:

- **Kleinkram** (Tippfehler, Formatieren, Übersetzen, kurze Faktenfrage) geht an Haiku
- **Standard** (Erklärungen, Mails, Zusammenfassungen, kleine Code-Änderungen) geht an Sonnet
- **Komplex** (Recherche mit Quellen, Programme bauen, Daten- oder Videoanalyse, Geld und Buchungen) bleibt beim Modell der Sitzung

Im Zweifel gilt die höhere Stufe. Kurze Antworten wie «ja» oder «weiter» behalten die vorherige Stufe. Nachrichten mit Anhang gehen nie an Haiku.

## Befehl

`/router` zeigt Modus und Zähler. `/router auto|klein|standard|komplex|aus` legt den Modus fest oder schaltet den Router ab.

## Installation

Im Terminal:

```
/plugin install modell-router --marketplace daze1997/modell-router
```

In der Desktop-App: **+** neben dem Eingabefeld → **Plugins** → **Add marketplace** mit `daze1997/modell-router` → **Add plugin**.

## Stand

Geprüft mit `claude plugin validate` und 4 Tests gegen eine nachgebildete Umgebung. Im echten Betrieb ausserhalb der Cloud-Sitzung noch nicht bestätigt.
