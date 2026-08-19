import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('global_ai_provider_credentials')
export class GlobalAiProviderCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  provider: string;

  @Column({ name: 'encrypted_api_key', type: 'text' })
  encryptedApiKey: string;

  @Column({ name: 'default_model', type: 'varchar', length: 255, nullable: true })
  defaultModel: string | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'credential_source', type: 'varchar', length: 50, default: 'ENVIRONMENT' })
  credentialSource: string;

  @Column({ name: 'last_health_check_at', type: 'timestamptz', nullable: true })
  lastHealthCheckAt: Date | null;

  @Column({ name: 'last_health_status', type: 'varchar', length: 50, nullable: true })
  lastHealthStatus: string | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'latency_ms', type: 'int', nullable: true })
  latencyMs: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
