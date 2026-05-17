import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

const numericTransformer = {
  from: (v: string | null): number | null => (v == null ? null : parseFloat(v)),
  to: (v: number | null): number | null => v,
};

@Entity('land_tax_rates')
export class LandTaxRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'smallint', nullable: false, unique: true })
  tax_year: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: false, transformer: numericTransformer })
  threshold: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: false, transformer: numericTransformer })
  base_amount: number;

  @Column({ type: 'numeric', precision: 5, scale: 3, nullable: false, transformer: numericTransformer })
  marginal_rate_pct: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: false, transformer: numericTransformer })
  premium_threshold: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: false, transformer: numericTransformer })
  premium_base_amount: number;

  @Column({ type: 'numeric', precision: 5, scale: 3, nullable: false, transformer: numericTransformer })
  premium_rate_pct: number;

  @Column({ type: 'numeric', precision: 5, scale: 3, nullable: false, default: 4, transformer: numericTransformer })
  foreign_surcharge_pct: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
