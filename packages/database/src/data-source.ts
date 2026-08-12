import { DataSource, type DataSourceOptions } from 'typeorm';
import { entities } from './entities';
import { migrations } from './migrations';

export interface DataSourceFactoryOptions {
  url: string;
  migrationsRun?: boolean;
  logging?: boolean;
}

export function createDataSourceOptions(options: DataSourceFactoryOptions): DataSourceOptions {
  return {
    type: 'postgres',
    url: options.url,
    entities,
    migrations,
    synchronize: false,
    migrationsRun: options.migrationsRun ?? false,
    logging: options.logging ?? false,
  };
}

export function createDataSource(options: DataSourceFactoryOptions): DataSource {
  return new DataSource(createDataSourceOptions(options));
}
