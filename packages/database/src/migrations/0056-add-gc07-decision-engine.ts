import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGc07DecisionEngine00561720000000056 implements MigrationInterface {
  name = 'AddGc07DecisionEngine00561720000000056';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Decision Priority Weights
    await queryRunner.query(`
      CREATE TABLE "decision_priority_weights" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" UUID NOT NULL,
        "strategy_type" VARCHAR(50) NOT NULL DEFAULT 'CUSTOM',
        "business_value" DOUBLE PRECISION NOT NULL DEFAULT 0.20,
        "search_opportunity" DOUBLE PRECISION NOT NULL DEFAULT 0.18,
        "severity" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
        "affected_traffic" DOUBLE PRECISION NOT NULL DEFAULT 0.12,
        "affected_pages" DOUBLE PRECISION NOT NULL DEFAULT 0.08,
        "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
        "urgency" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
        "effort_inverse" DOUBLE PRECISION NOT NULL DEFAULT 0.07,
        "priority_version" VARCHAR(50) NOT NULL DEFAULT 'DECISION_PRIORITY_V1',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "idx_dpweights_site" ON "decision_priority_weights" ("site_id");
    `);

    // 2. Decision Recommendations (enriched)
    await queryRunner.query(`
      CREATE TABLE "decision_recommendations" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" UUID NOT NULL,
        "issue_id" UUID,
        "recommendation_id" UUID,
        "title" TEXT NOT NULL,
        "description" TEXT NOT NULL DEFAULT '',
        "action_type" VARCHAR(40) NOT NULL,
        "target_url" TEXT,
        "cluster_id" UUID,
        "fingerprint" VARCHAR(64) NOT NULL,
        "merged_evidence" JSONB NOT NULL DEFAULT '{}',
        "source_count" INT NOT NULL DEFAULT 1,
        "priority_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "priority_version" VARCHAR(50) NOT NULL DEFAULT 'DECISION_PRIORITY_V1',
        "impact" VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
        "confidence_level" VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
        "effort_level" VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
        "safety_classification" VARCHAR(20) NOT NULL DEFAULT 'REVIEW_REQUIRED',
        "category" VARCHAR(30) NOT NULL DEFAULT 'TECHNICAL',
        "source" VARCHAR(30) NOT NULL,
        "merged_from_ids" JSONB NOT NULL DEFAULT '[]',
        "is_conflicting" BOOLEAN NOT NULL DEFAULT false,
        "conflicting_with" JSONB NOT NULL DEFAULT '[]',
        "conflict_resolution" VARCHAR(30),
        "is_stale" BOOLEAN NOT NULL DEFAULT false,
        "stale_reason" VARCHAR(30),
        "supersedes_id" UUID,
        "superseded_by_id" UUID,
        "depends_on" JSONB NOT NULL DEFAULT '[]',
        "blocks" JSONB NOT NULL DEFAULT '[]',
        "work_package_id" UUID,
        "status" VARCHAR(20) NOT NULL DEFAULT 'SUGGESTED',
        "suggested_action" TEXT NOT NULL DEFAULT '',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_drec_site_status" ON "decision_recommendations" ("site_id", "status");
      CREATE INDEX "idx_drec_site_priority" ON "decision_recommendations" ("site_id", "priority_score");
      CREATE INDEX "idx_drec_fingerprint" ON "decision_recommendations" ("fingerprint");
      CREATE INDEX "idx_drec_issue" ON "decision_recommendations" ("issue_id");
      CREATE INDEX "idx_drec_target" ON "decision_recommendations" ("target_url");
      CREATE INDEX "idx_drec_cluster" ON "decision_recommendations" ("cluster_id");
    `);

    // 3. Decision Work Packages
    await queryRunner.query(`
      CREATE TABLE "decision_work_packages" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" UUID NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT NOT NULL DEFAULT '',
        "target_url" TEXT,
        "cluster_id" UUID,
        "recommendation_ids" JSONB NOT NULL DEFAULT '[]',
        "estimated_effort" VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
        "priority_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_dwp_site_status" ON "decision_work_packages" ("site_id", "status");
      CREATE INDEX "idx_dwp_site_priority" ON "decision_work_packages" ("site_id", "priority_score");
    `);

    // 4. Recommendation Dependencies
    await queryRunner.query(`
      CREATE TABLE "decision_recommendation_dependencies" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" UUID NOT NULL,
        "dependent_id" UUID NOT NULL,
        "dependency_id" UUID NOT NULL,
        "dependency_type" VARCHAR(30) NOT NULL DEFAULT 'BLOCKS',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_drd_dependent" ON "decision_recommendation_dependencies" ("dependent_id");
      CREATE INDEX "idx_drd_dependency" ON "decision_recommendation_dependencies" ("dependency_id");
      CREATE INDEX "idx_drd_site" ON "decision_recommendation_dependencies" ("site_id");
    `);

    // 5. Recommendation Outcomes
    await queryRunner.query(`
      CREATE TABLE "decision_recommendation_outcomes" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" UUID NOT NULL,
        "recommendation_id" UUID NOT NULL,
        "task_id" UUID,
        "change_log_id" UUID,
        "implemented_at" TIMESTAMPTZ,
        "verified_at" TIMESTAMPTZ,
        "outcome" VARCHAR(30),
        "verification_type" VARCHAR(30),
        "observation_window_end" TIMESTAMPTZ,
        "evidence" JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_dro_recommendation" ON "decision_recommendation_outcomes" ("recommendation_id");
      CREATE INDEX "idx_dro_site" ON "decision_recommendation_outcomes" ("site_id");
      CREATE INDEX "idx_dro_outcome" ON "decision_recommendation_outcomes" ("outcome");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "decision_recommendation_outcomes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "decision_recommendation_dependencies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "decision_work_packages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "decision_recommendations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "decision_priority_weights"`);
  }
}
