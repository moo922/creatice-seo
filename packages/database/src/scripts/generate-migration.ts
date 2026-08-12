import { mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import { createDataSource } from '../data-source';
import { loadDbEnv } from './env';

/**
 * Generates a new TypeORM migration from the current entity definitions.
 * Usage: npm run migration:generate -- --name=MyMigrationName
 *
 * TypeORM 0.3 has no programmatic `generateMigrations` on DataSource, so this
 * replicates the CLI's schema-diff flow (SchemaBuilder.log) and writes a
 * migration file that follows the repo convention.
 */
async function main(): Promise<void> {
  const env = loadDbEnv();
  const nameArg = process.argv.find((arg) => arg.startsWith('--name='));
  const name = nameArg
    ? nameArg.slice('--name='.length)
    : `Phase${Date.now()}`;

  const dataSource = createDataSource({ url: env.DATABASE_URL, logging: true });
  await dataSource.initialize();

  const sqlInMemory = await dataSource.driver.createSchemaBuilder().log();

  if (sqlInMemory.upQueries.length === 0) {
    console.log('No schema differences found — nothing to generate.');
    await dataSource.destroy();
    return;
  }

  const timestamp = Date.now();
  const className = `Generate${name.replace(/[^A-Za-z0-9]/g, '')}${timestamp}`;
  const upQueries = sqlInMemory.upQueries.map((query) => query.query).join('\n');
  const downQueries = sqlInMemory.downQueries.map((query) => query.query).join('\n');

  const content = `import { MigrationInterface, QueryRunner } from 'typeorm';

export class ${className} implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(\`${escapeTemplate(upQueries)}\`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(\`${escapeTemplate(downQueries)}\`);
  }
}
`;

  const dir = path.resolve(__dirname, '../migrations');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${timestamp}-${name}.ts`);
  writeFileSync(file, content);

  console.log(`Generated migration: ${file}`);
  console.log('Remember to register it in src/migrations/index.ts.');
  await dataSource.destroy();
}

function escapeTemplate(sql: string): string {
  return sql.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

main().catch((error) => {
  console.error('Migration generation failed:', error);
  process.exit(1);
});
