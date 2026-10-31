// Vendor-Einstieg: wird von scripts/vendor.ts mit esbuild gebündelt (überschreibt die tsc-Ausgabe).
// Statisch importiert und im Precache, weil der Speicher beim Start (auch offline) gebraucht wird.
export * from 'offline-sync';
