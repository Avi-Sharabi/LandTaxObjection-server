import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNswLocalityCentroids1783000000000 implements MigrationInterface {
  name = 'CreateNswLocalityCentroids1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "nsw_locality_centroids" (
        "locality" text NOT NULL,
        "lat" double precision NOT NULL,
        "lng" double precision NOT NULL,
        "source" text NOT NULL DEFAULT 'arcgis',
        "geocoded_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_nsw_locality_centroids" PRIMARY KEY ("locality")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "nsw_locality_centroids"`);
  }
}
