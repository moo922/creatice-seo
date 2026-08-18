import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('ai_visibility_budgets')
export class AiVisibilityBudget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id', unique: true })
  siteId: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, name: 'monthly_observation_budget_usd', default: 10.0 })
  monthlyObservationBudgetUsd: number;

  @Column({ type: 'int', name: 'max_tests_per_run', default: 50 })
  maxTestsPerRun: number;

  @Column({ type: 'int', name: 'repeat_count', default: 1 })
  repeatCount: number;

  @Column({ type: 'jsonb', name: 'enabled_providers', default: () => "'[\"OPENAI\",\"ANTHROPIC\",\"PERPLEXITY\"]'" })
  enabledProviders: string[];

  @Column({ type: 'boolean', name: 'priority_prompt_only', default: false })
  priorityPromptOnly: boolean;

  @Column({ type: 'boolean', name: 'hard_budget', default: true })
  hardBudget: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
