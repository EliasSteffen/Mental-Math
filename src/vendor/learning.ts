// Vendor-Einstieg: Lernstand-Modell (packages/learning-engine). Wird von scripts/vendor.ts mit esbuild gebündelt (überschreibt
// die tsc-Ausgabe). Statisch importiert und im Precache: Skill, Schwächen und Empfehlung braucht schon die Startseite (auch offline).
// Nur der Kern – das Labor (learning-engine/lab: Simulation, Replay, Tuning) gehört nicht in die App.
export * from 'learning-engine';
