/**
 * Ambient declarations for the optional Lighthouse browser-audit dependencies.
 * These are loaded lazily at runtime (see lighthouse.service.ts) so the
 * application builds and boots without them; when installed, Lighthouse runs
 * headless-Chrome audits on representative URLs.
 */
declare module 'lighthouse';
declare module 'chrome-launcher';
