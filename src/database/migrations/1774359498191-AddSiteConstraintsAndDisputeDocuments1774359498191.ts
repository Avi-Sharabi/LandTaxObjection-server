import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSiteConstraintsAndDisputeDocuments1774359498191 implements MigrationInterface {
    name = 'AddSiteConstraintsAndDisputeDocuments1774359498191'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "dispute_legal_grounds" DROP CONSTRAINT "FK_dispute_legal_grounds_dispute"`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" DROP CONSTRAINT "FK_dispute_cases_client"`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" DROP CONSTRAINT "FK_dispute_cases_property"`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" DROP CONSTRAINT "FK_dispute_cases_valuation_notice"`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" DROP CONSTRAINT "FK_dispute_cases_accountant"`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" DROP CONSTRAINT "FK_dispute_cases_lawyer"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP CONSTRAINT "FK_clients_assigned_accountant"`);
        await queryRunner.query(`ALTER TABLE "properties" DROP CONSTRAINT "FK_properties_client"`);
        await queryRunner.query(`ALTER TABLE "assessment_documents" DROP CONSTRAINT "FK_assessment_documents_client"`);
        await queryRunner.query(`ALTER TABLE "valuation_notices" DROP CONSTRAINT "FK_valuation_notices_property"`);
        await queryRunner.query(`ALTER TABLE "valuation_notices" DROP CONSTRAINT "FK_valuation_notices_source_document"`);
        await queryRunner.query(`ALTER TABLE "valuation_notices" DROP CONSTRAINT "FK_valuation_notices_appraised_by"`);
        await queryRunner.query(`ALTER TABLE "dispute_legal_grounds" DROP CONSTRAINT "UQ_dispute_legal_grounds_dispute_ground"`);
        await queryRunner.query(`CREATE TYPE "public"."site_constraints_constraint_type_enum" AS ENUM('heritage_listing', 'flood_zone_100yr', 'bushfire_bal_restriction', 'easement_or_right_of_way', 'environmental_conservation_overlay', 'zoning_planning_restriction', 'access_restriction_landlocked', 'contamination_remediation', 'other')`);
        await queryRunner.query(`CREATE TABLE "site_constraints" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "dispute_id" uuid NOT NULL, "constraint_type" "public"."site_constraints_constraint_type_enum" NOT NULL, "description" text, "legal_argument" text, "document_blob_url" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5a3caebff8b10c2f08fb2442134" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."dispute_documents_document_type_enum" AS ENUM('valuation_notice', 'land_tax_assessment', 'land_title_search', 'independent_valuation', 'property_report', 'photograph', 'legal_document', 'generated_objection', 'advisory_letter', 'other')`);
        await queryRunner.query(`CREATE TABLE "dispute_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "dispute_id" uuid NOT NULL, "document_type" "public"."dispute_documents_document_type_enum" NOT NULL, "filename" text NOT NULL, "blob_storage_url" text NOT NULL, "uploaded_by" uuid, "uploaded_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_37a9c1464e79d9b80c655193292" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "dispute_legal_grounds" ADD CONSTRAINT "UQ_eb881d86b2df5211503f5a4696e" UNIQUE ("dispute_id", "ground")`);
        await queryRunner.query(`ALTER TABLE "dispute_legal_grounds" ADD CONSTRAINT "FK_e55585d038987cc1284647a38ec" FOREIGN KEY ("dispute_id") REFERENCES "dispute_cases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" ADD CONSTRAINT "FK_9cef2286fa3a3ed874c7556ee53" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" ADD CONSTRAINT "FK_0d0f2c62fd1c52e817c5c6d8a13" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" ADD CONSTRAINT "FK_2c82ea9e97f9f04a8aacf9cb25a" FOREIGN KEY ("valuation_notice_id") REFERENCES "valuation_notices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" ADD CONSTRAINT "FK_1bededf08bc8a3961ef90e81c6e" FOREIGN KEY ("assigned_accountant_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" ADD CONSTRAINT "FK_ec48420f6038f82e5698d9988a3" FOREIGN KEY ("assigned_lawyer_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "clients" ADD CONSTRAINT "FK_c34634ea0a10faa81ffb9ae4e87" FOREIGN KEY ("assigned_accountant_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "properties" ADD CONSTRAINT "FK_9fab03377d70c7bcbd09732dd84" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "assessment_documents" ADD CONSTRAINT "FK_2f7f609b9572c8aae0f017e79a3" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "valuation_notices" ADD CONSTRAINT "FK_792b042995ad2708e139e976fba" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "valuation_notices" ADD CONSTRAINT "FK_ab736f8014d58507c8e0a042b7d" FOREIGN KEY ("source_document_id") REFERENCES "assessment_documents"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "site_constraints" ADD CONSTRAINT "FK_7c13f2498bcad9a05c89be06f5b" FOREIGN KEY ("dispute_id") REFERENCES "dispute_cases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dispute_documents" ADD CONSTRAINT "FK_0e545593d88d490ea37d6c59b05" FOREIGN KEY ("dispute_id") REFERENCES "dispute_cases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dispute_documents" ADD CONSTRAINT "FK_dea073ab4069d446d5095c965ee" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "dispute_documents" DROP CONSTRAINT "FK_dea073ab4069d446d5095c965ee"`);
        await queryRunner.query(`ALTER TABLE "dispute_documents" DROP CONSTRAINT "FK_0e545593d88d490ea37d6c59b05"`);
        await queryRunner.query(`ALTER TABLE "site_constraints" DROP CONSTRAINT "FK_7c13f2498bcad9a05c89be06f5b"`);
        await queryRunner.query(`ALTER TABLE "valuation_notices" DROP CONSTRAINT "FK_ab736f8014d58507c8e0a042b7d"`);
        await queryRunner.query(`ALTER TABLE "valuation_notices" DROP CONSTRAINT "FK_792b042995ad2708e139e976fba"`);
        await queryRunner.query(`ALTER TABLE "assessment_documents" DROP CONSTRAINT "FK_2f7f609b9572c8aae0f017e79a3"`);
        await queryRunner.query(`ALTER TABLE "properties" DROP CONSTRAINT "FK_9fab03377d70c7bcbd09732dd84"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP CONSTRAINT "FK_c34634ea0a10faa81ffb9ae4e87"`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" DROP CONSTRAINT "FK_ec48420f6038f82e5698d9988a3"`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" DROP CONSTRAINT "FK_1bededf08bc8a3961ef90e81c6e"`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" DROP CONSTRAINT "FK_2c82ea9e97f9f04a8aacf9cb25a"`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" DROP CONSTRAINT "FK_0d0f2c62fd1c52e817c5c6d8a13"`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" DROP CONSTRAINT "FK_9cef2286fa3a3ed874c7556ee53"`);
        await queryRunner.query(`ALTER TABLE "dispute_legal_grounds" DROP CONSTRAINT "FK_e55585d038987cc1284647a38ec"`);
        await queryRunner.query(`ALTER TABLE "dispute_legal_grounds" DROP CONSTRAINT "UQ_eb881d86b2df5211503f5a4696e"`);
        await queryRunner.query(`DROP TABLE "dispute_documents"`);
        await queryRunner.query(`DROP TYPE "public"."dispute_documents_document_type_enum"`);
        await queryRunner.query(`DROP TABLE "site_constraints"`);
        await queryRunner.query(`DROP TYPE "public"."site_constraints_constraint_type_enum"`);
        await queryRunner.query(`ALTER TABLE "dispute_legal_grounds" ADD CONSTRAINT "UQ_dispute_legal_grounds_dispute_ground" UNIQUE ("dispute_id", "ground")`);
        await queryRunner.query(`ALTER TABLE "valuation_notices" ADD CONSTRAINT "FK_valuation_notices_appraised_by" FOREIGN KEY ("appraised_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "valuation_notices" ADD CONSTRAINT "FK_valuation_notices_source_document" FOREIGN KEY ("source_document_id") REFERENCES "assessment_documents"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "valuation_notices" ADD CONSTRAINT "FK_valuation_notices_property" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "assessment_documents" ADD CONSTRAINT "FK_assessment_documents_client" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "properties" ADD CONSTRAINT "FK_properties_client" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "clients" ADD CONSTRAINT "FK_clients_assigned_accountant" FOREIGN KEY ("assigned_accountant_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" ADD CONSTRAINT "FK_dispute_cases_lawyer" FOREIGN KEY ("assigned_lawyer_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" ADD CONSTRAINT "FK_dispute_cases_accountant" FOREIGN KEY ("assigned_accountant_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" ADD CONSTRAINT "FK_dispute_cases_valuation_notice" FOREIGN KEY ("valuation_notice_id") REFERENCES "valuation_notices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" ADD CONSTRAINT "FK_dispute_cases_property" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dispute_cases" ADD CONSTRAINT "FK_dispute_cases_client" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dispute_legal_grounds" ADD CONSTRAINT "FK_dispute_legal_grounds_dispute" FOREIGN KEY ("dispute_id") REFERENCES "dispute_cases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
