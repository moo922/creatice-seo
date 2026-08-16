/**
 * Deterministic audit rule registry. Rules are code, not AI — every check is a
 * pure function over the signals captured by a versioned crawl run. Findings
 * carry machine-readable evidence for the Issues engine.
 */

export * from './contract';
export * from './context';
export * from './helpers';
export * from './registry';
export * from './scoring';
export * from './rules/technical';
export * from './rules/on-page';
export * from './rules/structured-data';
export * from './rules/crawl-architecture';
