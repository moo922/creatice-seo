import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Versioned prompt registry. Business services reference prompts by name and
 * never hard-code long prompts. Each prompt has an immutable version; exactly
 * one version per name should be ACTIVE.
 */
@Entity('ai_prompts')
@Index('idx_ai_prompts_name_version', ['promptName', 'version'], { unique: true })
export class AiPrompt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200, name: 'prompt_name' })
  promptName: string;

  @Column({ type: 'int', name: 'version' })
  version: number;

  /** System prompt used when rendering this prompt. */
  @Column({ type: 'text', name: 'system_prompt' })
  systemPrompt: string;

  /** User prompt template with {{placeholder}} variables. */
  @Column({ type: 'text', name: 'template' })
  template: string;

  /** JSON schema for structured output (null for free-form text). */
  @Column({ type: 'jsonb', name: 'schema', nullable: true })
  schema: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 20, name: 'status', default: 'DRAFT' })
  status: 'ACTIVE' | 'DRAFT' | 'DEPRECATED';

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
