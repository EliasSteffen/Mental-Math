// Refresh-Token nativer App-Hüllen: per Header statt Cookie (Cookies erreichen den Server von capacitor:// aus nicht).
// Antwort mit leerem Wert = Token löschen.
export const REFRESH_HEADER = 'x-refresh-token';
