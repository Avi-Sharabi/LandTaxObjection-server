import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropSiteConstraints1775000000000 implements MigrationInterface {
  name = 'DropSiteConstraints1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop documents table first (FK dependency on site_constraints)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_site_constraint_documents_constraint_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "site_constraint_documents"`);

    // Drop the constraints table and its enum type
    await queryRunner.query(`DROP TABLE IF EXISTS "site_constraints"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."site_constraints_constraint_type_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."site_constraints_constraint_type_enum" AS ENUM('heritage_listing', 'flood_zone_100yr', 'bushfire_bal_restriction', 'easement_or_right_of_way', 'environmental_conservation_overlay', 'zoning_planning_restriction', 'access_restriction_landlocked', 'contamination_remediation', 'other')`);
    await queryRunner.query(`CREATE TABLE "site_constraints" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "dispute_id" uuid NOT NULL, "constraint_type" "public"."site_constraints_constraint_type_enum" NOT NULL, "description" text, "legal_argument" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5a3caebff8b10c2f08fb2442134" PRIMARY KEY ("id"))`);
    await queryRunner.query(`ALTER TABLE "site_constraints" ADD CONSTRAINT "FK_7c13f2498bcad9a05c89be06f5b" FOREIGN KEY ("dispute_id") REFERENCES "dispute_cases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`CREATE TABLE "site_constraint_documents" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "constraint_id" uuid NOT NULL, "blob_path" text NOT NULL, "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT "PK_site_constraint_documents" PRIMARY KEY ("id"), CONSTRAINT "FK_site_constraint_documents_constraint" FOREIGN KEY ("constraint_id") REFERENCES "site_constraints"("id") ON DELETE CASCADE)`);
    await queryRunner.query(`CREATE INDEX "IDX_site_constraint_documents_constraint_id" ON "site_constraint_documents" ("constraint_id")`);
  }
}
