import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gap Closure 04 — Keyword Intelligence domain expansion.
 *
 * - keywords: add language/locale/country/business_relevance/question_tag/
 *   brand/competitor/discovery_reason/manual_lock; widen status values.
 * - New tables: keyword_sources, keyword_planner_metrics, google_ads_integrations,
 *   keyword_discovery_jobs, keyword_opportunities, cannibalization_cases.
 * - clusters: add primary_keyword_id, secondary_intent, business_relevance,
 *   manual_lock, cluster_version.
 * - cluster_keywords: add confidence, reason, source, approved; widen role.
 * - url_mappings: add wp_post_id, mapping_type, status, confidence, reason,
 *   approved_at.
 *
 * Existing approved mappings are never destroyed. This migration only adds
 * columns/tables — it never rewrites existing rows.
 */
export class KeywordIntelligence00481720000000048 implements MigrationInterface {
  name = 'KeywordIntelligence00481720000000048';

  async up(qr: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // keywords — expansion
    // ------------------------------------------------------------------
    await qr.query(`ALTER TABLE keywords ADD COLUMN IF NOT EXISTS language varchar(10)`);
    await qr.query(`ALTER TABLE keywords ADD COLUMN IF NOT EXISTS locale varchar(10)`);
    await qr.query(`ALTER TABLE keywords ADD COLUMN IF NOT EXISTS country varchar(10)`);
    await qr.query(`ALTER TABLE keywords ADD COLUMN IF NOT EXISTS business_relevance varchar(30)`);
    await qr.query(`ALTER TABLE keywords ADD COLUMN IF NOT EXISTS question_tag varchar(30)`);
    await qr.query(`ALTER TABLE keywords ADD COLUMN IF NOT EXISTS brand_classification varchar(30)`);
    await qr.query(`ALTER TABLE keywords ADD COLUMN IF NOT EXISTS competitor_classification varchar(30)`);
    await qr.query(`ALTER TABLE keywords ADD COLUMN IF NOT EXISTS discovery_reason varchar(30)`);
    await qr.query(`ALTER TABLE keywords ADD COLUMN IF NOT EXISTS manual_lock boolean NOT NULL DEFAULT false`);
    await qr.query(`ALTER TABLE keywords ALTER COLUMN source TYPE varchar(30)`);
    await qr.query(`ALTER TABLE keywords ALTER COLUMN status TYPE varchar(20)`);
    await qr.query(`ALTER TABLE keywords ALTER COLUMN intent TYPE varchar(30)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_keywords_site_status ON keywords (site_id, status)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_keywords_site_language ON keywords (site_id, language)`);

    // ------------------------------------------------------------------
    // keyword_sources — multi-source associations
    // ------------------------------------------------------------------
    await qr.query(`
      CREATE TABLE IF NOT EXISTS keyword_sources (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        keyword_id uuid NOT NULL,
        site_id uuid NOT NULL,
        source varchar(30) NOT NULL,
        source_value text,
        count int NOT NULL DEFAULT 1,
        first_seen_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_keyword_sources_keyword_source ON keyword_sources (keyword_id, source)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_keyword_sources_site_source ON keyword_sources (site_id, source)`);
    await qr.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_keyword_sources_keyword_source ON keyword_sources (keyword_id, source)`);

    // ------------------------------------------------------------------
    // keyword_metrics — widen source values to uppercase (GSC/GOOGLE_ADS/...)
    // ------------------------------------------------------------------
    await qr.query(`ALTER TABLE keyword_metrics ALTER COLUMN source TYPE varchar(20)`);
    await qr.query(`ALTER TABLE keyword_metrics ALTER COLUMN source SET DEFAULT 'GSC'`);

    // ------------------------------------------------------------------
    // clusters — expansion
    // ------------------------------------------------------------------
    await qr.query(`ALTER TABLE clusters ADD COLUMN IF NOT EXISTS secondary_intent varchar(30)`);
    await qr.query(`ALTER TABLE clusters ADD COLUMN IF NOT EXISTS business_relevance varchar(30)`);
    await qr.query(`ALTER TABLE clusters ADD COLUMN IF NOT EXISTS primary_keyword_id uuid`); 
    await qr.query(`ALTER TABLE clusters ADD COLUMN IF NOT EXISTS manual_lock boolean NOT NULL DEFAULT false`);
    await qr.query(`ALTER TABLE clusters ADD COLUMN IF NOT EXISTS cluster_version varchar(100)`);
    await qr.query(`ALTER TABLE clusters ALTER COLUMN intent TYPE varchar(30)`);
    await qr.query(`ALTER TABLE clusters ALTER COLUMN page_type TYPE varchar(20)`);
    await qr.query(`ALTER TABLE clusters ALTER COLUMN recommended_action TYPE varchar(20)`);
    await qr.query(`ALTER TABLE clusters ALTER COLUMN status TYPE varchar(20)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_clusters_site_status ON clusters (site_id, status)`);

    // ------------------------------------------------------------------
    // cluster_keywords — expansion
    // ------------------------------------------------------------------
    await qr.query(`ALTER TABLE cluster_keywords ALTER COLUMN role TYPE varchar(30)`);
    await qr.query(`ALTER TABLE cluster_keywords ADD COLUMN IF NOT EXISTS confidence double precision`);
    await qr.query(`ALTER TABLE cluster_keywords ADD COLUMN IF NOT EXISTS reason text`);
    await qr.query(`ALTER TABLE cluster_keywords ADD COLUMN IF NOT EXISTS source varchar(30)`);
    await qr.query(`ALTER TABLE cluster_keywords ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_cluster_keywords_keyword ON cluster_keywords (keyword_id)`);

    // ------------------------------------------------------------------
    // url_mappings — expansion
    // ------------------------------------------------------------------
    await qr.query(`ALTER TABLE url_mappings ADD COLUMN IF NOT EXISTS wp_post_id bigint`);
    await qr.query(`ALTER TABLE url_mappings ADD COLUMN IF NOT EXISTS mapping_type varchar(30) NOT NULL DEFAULT 'EXISTING'`);
    await qr.query(`ALTER TABLE url_mappings ADD COLUMN IF NOT EXISTS status varchar(30) NOT NULL DEFAULT 'SUGGESTED'`);
    await qr.query(`ALTER TABLE url_mappings ADD COLUMN IF NOT EXISTS confidence double precision`);
    await qr.query(`ALTER TABLE url_mappings ADD COLUMN IF NOT EXISTS reason text`);
    await qr.query(`ALTER TABLE url_mappings ADD COLUMN IF NOT EXISTS approved_at timestamptz`);
    await qr.query(`ALTER TABLE url_mappings ALTER COLUMN source TYPE varchar(30)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_url_mappings_site_status ON url_mappings (site_id, status)`);

    // ------------------------------------------------------------------
    // keyword_planner_metrics (Google Ads) — strictly separate from GSC
    // ------------------------------------------------------------------
    await qr.query(`
      CREATE TABLE IF NOT EXISTS keyword_planner_metrics (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        keyword_id uuid NOT NULL,
        site_id uuid NOT NULL,
        location_target varchar(30),
        language_target varchar(30),
        avg_monthly_searches double precision,
        competition varchar(50),
        competition_index double precision,
        historical_months jsonb,
        retrieved_at timestamptz NOT NULL,
        source_version varchar(50),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_kpm_keyword ON keyword_planner_metrics (keyword_id)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_kpm_site ON keyword_planner_metrics (site_id)`);

    // ------------------------------------------------------------------
    // google_ads_integrations
    // ------------------------------------------------------------------
    await qr.query(`
      CREATE TABLE IF NOT EXISTS google_ads_integrations (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        site_id uuid NOT NULL,
        status varchar(30) NOT NULL DEFAULT 'NOT_CONFIGURED',
        customer_id varchar(50),
        language_target varchar(20),
        location_targets jsonb NOT NULL DEFAULT '[]',
        last_keyword_sync_at timestamptz,
        last_keyword_sync_summary jsonb,
        last_error text,
        last_error_code varchar(50),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_google_ads_integrations_site ON google_ads_integrations (site_id)`);

    // ------------------------------------------------------------------
    // keyword_discovery_jobs
    // ------------------------------------------------------------------
    await qr.query(`
      CREATE TABLE IF NOT EXISTS keyword_discovery_jobs (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        site_id uuid NOT NULL,
        job_type varchar(30) NOT NULL,
        input jsonb NOT NULL DEFAULT '{}',
        language varchar(10),
        country varchar(10),
        city varchar(100),
        max_ideas int NOT NULL DEFAULT 100,
        status varchar(20) NOT NULL DEFAULT 'PENDING',
        ideas_received int NOT NULL DEFAULT 0,
        keywords_created int NOT NULL DEFAULT 0,
        started_at timestamptz,
        finished_at timestamptz,
        error text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_kdj_site ON keyword_discovery_jobs (site_id)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_kdj_site_status ON keyword_discovery_jobs (site_id, status)`);

    // ------------------------------------------------------------------
    // keyword_opportunities
    // ------------------------------------------------------------------
    await qr.query(`
      CREATE TABLE IF NOT EXISTS keyword_opportunities (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        site_id uuid NOT NULL,
        cluster_id uuid,
        keyword_id uuid,
        type varchar(40) NOT NULL,
        target_url text,
        impact varchar(20) NOT NULL,
        confidence double precision NOT NULL,
        effort varchar(20) NOT NULL,
        priority_score double precision NOT NULL,
        score_version varchar(50) NOT NULL,
        evidence jsonb NOT NULL DEFAULT '{}',
        status varchar(20) NOT NULL DEFAULT 'OPEN',
        reason text,
        decided_by uuid,
        decided_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ko_site_status ON keyword_opportunities (site_id, status)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ko_site_priority ON keyword_opportunities (site_id, priority_score)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ko_cluster ON keyword_opportunities (cluster_id)`);

    // ------------------------------------------------------------------
    // cannibalization_cases
    // ------------------------------------------------------------------
    await qr.query(`
      CREATE TABLE IF NOT EXISTS cannibalization_cases (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        site_id uuid NOT NULL,
        cluster_id uuid,
        query text,
        urls jsonb NOT NULL DEFAULT '[]',
        classification varchar(30) NOT NULL,
        score double precision NOT NULL,
        recommendation varchar(40),
        reason text,
        status varchar(20) NOT NULL DEFAULT 'OPEN',
        preferred_target text,
        decided_by uuid,
        decided_at timestamptz,
        detected_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_cannib_site_status ON cannibalization_cases (site_id, status)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_cannib_site_query ON cannibalization_cases (site_id, query)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS cannibalization_cases`);
    await qr.query(`DROP TABLE IF EXISTS keyword_opportunities`);
    await qr.query(`DROP TABLE IF EXISTS keyword_discovery_jobs`);
    await qr.query(`DROP TABLE IF EXISTS google_ads_integrations`);
    await qr.query(`DROP TABLE IF EXISTS keyword_planner_metrics`);
    await qr.query(`DROP TABLE IF EXISTS keyword_sources`);
  }
}