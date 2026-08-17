import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPublicationVerificationFields00471720000000047 implements MigrationInterface {
  name = 'AddPublicationVerificationFields00471720000000047';

  async up(qr: QueryRunner): Promise<void> {
    // Content publications: verification, conflict, pre-change snapshot, idempotency
    await qr.query(`ALTER TABLE content_publications ADD COLUMN IF NOT EXISTS verification jsonb`);
    await qr.query(`ALTER TABLE content_publications ADD COLUMN IF NOT EXISTS conflict jsonb`);
    await qr.query(`ALTER TABLE content_publications ADD COLUMN IF NOT EXISTS pre_change_snapshot jsonb`);
    await qr.query(`ALTER TABLE content_publications ADD COLUMN IF NOT EXISTS idempotency_key text`);
    await qr.query(`ALTER TABLE content_publications ADD COLUMN IF NOT EXISTS connector_version varchar(50)`);
    await qr.query(`ALTER TABLE content_publications ALTER COLUMN status TYPE varchar(20)`);

    // WP integrations: connector version tracking
    await qr.query(`ALTER TABLE wp_integrations ADD COLUMN IF NOT EXISTS connector_version varchar(50)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE content_publications DROP COLUMN IF EXISTS verification`);
    await qr.query(`ALTER TABLE content_publications DROP COLUMN IF EXISTS conflict`);
    await qr.query(`ALTER TABLE content_publications DROP COLUMN IF EXISTS pre_change_snapshot`);
    await qr.query(`ALTER TABLE content_publications DROP COLUMN IF EXISTS idempotency_key`);
    await qr.query(`ALTER TABLE content_publications DROP COLUMN IF EXISTS connector_version`);
    await qr.query(`ALTER TABLE wp_integrations DROP COLUMN IF EXISTS connector_version`);
  }
}
