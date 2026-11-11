// Kontakt für Feedback und die öffentlichen Seiten. Die Adresse steht zerlegt im Quelltext (kein Klartext für Adress-Sammler):
// die Seiten zeigen „mail(at)…“, das mailto:-Ziel setzt contactAddress() zur Laufzeit zusammen.
export const CONTACT = { name: 'Elias Steffen', user: 'mail', domain: 'elias-steffen.de' } as const;

/** Anzeige auf den Seiten (ohne @, damit der Text nicht als Link erkannt wird). */
export function contactDisplay(): string {
  return `${CONTACT.user}(at)${CONTACT.domain}`;
}

/** Echte Adresse, nur für mailto: */
export function contactAddress(): string {
  return `${CONTACT.user}@${CONTACT.domain}`;
}
