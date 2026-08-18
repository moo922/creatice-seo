import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddCrawlPageText17000000050 implements MigrationInterface {
  name = '0050-add-crawl-page-text';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE "crawl_pages" ADD COLUMN "text" text`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE "crawl_pages" DROP COLUMN "text"`);
  }
}
