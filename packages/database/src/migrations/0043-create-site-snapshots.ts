import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSiteSnapshots00431720000000043 implements MigrationInterface {
  name = 'CreateSiteSnapshots00431720000000043';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE site_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id UUID NOT NULL,
        snapshot_type VARCHAR(20) NOT NULL,
        captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        effective_date DATE NOT NULL,
        version INT NOT NULL DEFAULT 1,
        reference_crawl_run_id UUID,
        reference_audit_run_id UUID,
        gsc_period_start DATE,
        gsc_period_end DATE,
        metrics JSONB NOT NULL DEFAULT '{}',
        data_quality JSONB NOT NULL DEFAULT '{}',
        availability JSONB NOT NULL DEFAULT '{}'
      )
    `);

    await qr.query(`CREATE INDEX idx_site_snapshot_site_type ON site_snapshots(site_id, snapshot_type)`);
    await qr.query(`CREATE INDEX idx_site_snapshot_site_captured ON site_snapshots(site_id, captured_at)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS site_snapshots`);
  }
}
