import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DisputeCase } from '../../dispute-cases/entities/dispute-case.entity';
import { User } from '../../users/entities/user.entity';

@Entity('comparable_sales')
export class ComparableSale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, name: 'dispute_case_id' })
  dispute_case_id: string;

  @Column({ type: 'uuid', nullable: false, name: 'created_by_id' })
  created_by_id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  // ── property_sales_raw fields ─────────────────────────────────────────────

  @Column({ type: 'varchar', nullable: true })
  sale_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  source_file: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  imported_at: Date | null;

  @Column({ type: 'varchar', nullable: true })
  district_code: string | null;

  @Column({ type: 'varchar', nullable: true })
  property_id: string | null;

  @Column({ type: 'integer', nullable: true })
  sale_counter: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  download_datetime: Date | null;

  @Column({ type: 'varchar', nullable: true })
  property_name: string | null;

  @Column({ type: 'varchar', nullable: true })
  property_unit_number: string | null;

  @Column({ type: 'varchar', nullable: true })
  property_house_number: string | null;

  @Column({ type: 'varchar', nullable: true })
  property_street_name: string | null;

  @Column({ type: 'varchar', nullable: true })
  property_locality: string | null;

  @Column({ type: 'varchar', nullable: true })
  property_post_code: string | null;

  @Column({ type: 'numeric', precision: 15, scale: 4, nullable: true })
  area: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  contract_date: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  settlement_date: Date | null;

  @Column({ type: 'numeric', precision: 20, scale: 2, nullable: true })
  purchase_price: number | null;

  @Column({ type: 'varchar', nullable: true })
  zoning: string | null;

  @Column({ type: 'varchar', nullable: true })
  nature_of_property: string | null;

  @Column({ type: 'varchar', nullable: true })
  primary_purpose: string | null;

  @Column({ type: 'varchar', nullable: true })
  strata_lot_number: string | null;

  @Column({ type: 'varchar', nullable: true })
  component_code: string | null;

  @Column({ type: 'varchar', nullable: true })
  sale_code: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 4, nullable: true })
  interest_of_sale_percent: number | null;

  @Column({ type: 'varchar', nullable: true })
  dealing_number: string | null;

  @Column({ type: 'varchar', nullable: true })
  owner_type: string | null;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  adjusted_rate_per_sqm: number | null;

  @Column({ type: 'numeric', precision: 20, scale: 2, nullable: true })
  adjusted_land_value: number | null;

  @Column({ type: 'numeric', precision: 20, scale: 2, nullable: true })
  suggested_land_value: number | null;

  @Column({ type: 'text', nullable: true })
  explanation: string | null;

  // Structured confidence signal (see 1784100000000-AddImprovementConfidenceToComparableSales) —
  // 'exact': vacant land, no improvement deduction applied, the strongest/least-estimated
  // evidence. 'estimated': an improved sale relying on the flat 50% improvement-deduction
  // estimate (no GFA/building data exists in property_sales_raw to do better — see
  // ComparablesService.computeAdjustedFields).
  @Column({ type: 'text', nullable: true })
  improvement_confidence: 'exact' | 'estimated' | null;

  // How this comparable cleared the size-band gate (see 1784200000000-AddSizeTierToComparableSales
  // / ComparablesService.SIZE_BAND_TOLERANCE_FRACTION) — 'preferred': within the standard ±30%
  // band. 'widened': outside ±30% but within the deterministic auto-include path's ±50% band.
  // 'extrapolated': a ranked-last-resort pick (see selectRankedLastResortCandidates) outside even
  // the widened band, or an otherwise-unresolved zoning/size mismatch — the whole reason this
  // column exists is so classifyComparablesForMedian (comparable-quarantine.util.ts) can keep an
  // 'extrapolated' pick out of the headline $/m² median regardless of whether its rate happens to
  // pass the IQR outlier fence, and so the report/Ground text can disclose it honestly instead of
  // silently rendering "INCLUDED". null for any comparable persisted before this column existed,
  // or entered manually via create().
  @Column({ type: 'text', nullable: true })
  size_tier: 'preferred' | 'widened' | 'extrapolated' | null;

  // ── Relations ─────────────────────────────────────────────────────────────

  @ManyToOne(() => DisputeCase, (disputeCase) => disputeCase.comparables, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dispute_case_id' })
  dispute_case: DisputeCase;

  @ManyToOne(() => User, { nullable: false, eager: false })
  @JoinColumn({ name: 'created_by_id' })
  created_by: User;
}
