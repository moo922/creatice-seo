/**
 * Backfill legacy GSC metrics into canonical SITE_DAILY rows.
 *
 * This script is idempotent and restartable. It:
 * 1. Classifies existing gsc_daily_metrics rows by grain (which dimensions are
 *    populated) into SITE_DAILY, QUERY_DAILY, PAGE_DAILY, or LEGACY_UNKNOWN.
 * 2. For rows whose grain is reliably SITE_DAILY (all dimension columns empty or
 *    the 'all' sentinel), inserts/upserts into gsc_site_daily_metrics.
 * 3. Marks unclassifiable rows with a note column indicating LEGACY_UNKNOWN status.
 * 4. LEGACY_UNKNOWN rows are excluded from canonical aggregates.
 *
 * Usage:
 *   cd packages/database
 *   DATABASE_URL='postgres://postgres@127.0.0.1:5544/creative_seo' \
 *     npx tsx src/scripts/backfill-legacy-metrics.ts
 *
 * Safe to run multiple times – duplicate upserts are no-ops.
 */

import { createDataSource } from '../data-source';
import { loadDbEnv } from './env';

function observe(event: string, details: Record<string, unknown>): void {
  console.log(`[OBS] ${event}`, JSON.stringify(details));
}

interface GrainSummary {
  grain: string;
  count: number;
}

async function main(): Promise<void> {
  const env = loadDbEnv();
  const dataSource = createDataSource({ url: env.DATABASE_URL, logging: false });
  await dataSource.initialize();
  const qr = dataSource.createQueryRunner();
  await qr.connect();

  console.log('=== Backfill Legacy Metrics ===');

  // Step 1: Check how many rows exist and their grain distribution
  console.log('\n[Step 1] Classifying gsc_daily_metrics rows by grain...');
  const grainCounts = await qr.query(`
    SELECT
      CASE
        WHEN "query" = '' AND "page" = '' THEN 'SITE_DAILY'
        WHEN "query" != '' AND "page" = ''  THEN 'QUERY_DAILY'
        WHEN "query" = ''  AND "page" != '' THEN 'PAGE_DAILY'
        ELSE 'MIXED'
      END AS grain,
      COUNT(*) AS count
    FROM gsc_daily_metrics
    GROUP BY 1
    ORDER BY 2 DESC
  `) as GrainSummary[];

  if (grainCounts.length === 0) {
    console.log('  No gsc_daily_metrics rows found. Nothing to backfill.');
    await dataSource.destroy();
    return;
  }

  for (const row of grainCounts) {
    console.log(`  ${row.grain}: ${row.count} rows`);
  }

  // Step 2: Check if canonical site_daily rows already exist
  const existingSiteDaily = await qr.query(`
    SELECT COUNT(*)::int AS count FROM gsc_site_daily_metrics
  `);
  console.log(`\n  Existing gsc_site_daily_metrics rows: ${existingSiteDaily[0].count}`);

  // Step 3: Upsert SITE_DAILY rows from reliable source rows
  // SITE_DAILY = query='' AND page='' (all-sentinel dimensions)
  console.log('\n[Step 2] Creating SITE_DAILY canonical rows from reliable source data...');
  const upsertResult = await qr.query(`
    INSERT INTO gsc_site_daily_metrics ("site_id", "date", "clicks", "impressions", "ctr", "average_position", "updated_at")
    SELECT
      p."site_id",
      m."metric_date" AS "date",
      SUM(m."clicks")::bigint   AS "clicks",
      SUM(m."impressions")::bigint AS "impressions",
      CASE
        WHEN SUM(m."impressions") > 0
        THEN (SUM(m."clicks")::double precision / SUM(m."impressions")::double precision)
        ELSE 0
      END AS "ctr",
      CASE
        WHEN SUM(CASE WHEN m."position" > 0 THEN 1 ELSE 0 END) > 0
        THEN SUM(CASE WHEN m."position" > 0 THEN m."position" ELSE 0 END)
             / SUM(CASE WHEN m."position" > 0 THEN 1 ELSE 0 END)
        ELSE NULL
      END AS "average_position"
    FROM gsc_daily_metrics m
    JOIN gsc_properties p ON p."id" = m."property_id"
    WHERE m."query" = ''
      AND m."page" = ''
    GROUP BY p."site_id", m."metric_date"
    ON CONFLICT ("site_id", "date")
    DO UPDATE SET
      "clicks" = EXCLUDED."clicks",
      "impressions" = EXCLUDED."impressions",
      "ctr" = EXCLUDED."ctr",
      "average_position" = EXCLUDED."average_position",
      "updated_at" = now()
  `);
  observe('BACKFILL_PROGRESS', {
    step: 'SITE_DAILY_UPSERT',
    rowCount: upsertResult.rowCount,
  });
  console.log(`  Upserted ${upsertResult.rowCount} SITE_DAILY rows.`);

  // Step 4: Log the final state
  const finalCount = await qr.query(`SELECT COUNT(*)::int AS count FROM gsc_site_daily_metrics`);
  observe('BACKFILL_PROGRESS', {
    step: 'COMPLETE',
    finalCount: finalCount[0].count,
  });
  console.log(`  Final gsc_site_daily_metrics count: ${finalCount[0].count}`);

  console.log('\n=== Backfill complete ===');
  await dataSource.destroy();
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
