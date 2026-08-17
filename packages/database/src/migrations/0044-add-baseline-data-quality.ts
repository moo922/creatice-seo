import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBaselineDataQuality00441720000000044 implements MigrationInterface {
  name = 'AddBaselineDataQuality00441720000000044';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE baseline_snapshots
      ADD COLUMN data_quality JSONB NOT NULL DEFAULT '{}'
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE baseline_snapshots DROP COLUMN IF EXISTS data_quality`);
  }
}
