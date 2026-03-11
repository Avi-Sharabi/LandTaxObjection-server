import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { DisputeCase } from '../../dispute-cases/entities/dispute-case.entity';

export enum LegalGround {
  INCORRECT_LAND_VALUE = 'incorrect_land_value',
  CONSTRAINT_OVERSIGHT = 'constraint_oversight',
  INCORRECT_AREA_OR_DIMENSIONS = 'incorrect_area_or_dimensions',
  INCORRECT_APPORTIONMENT = 'incorrect_apportionment',
}

@Entity('dispute_legal_grounds')
@Unique(['dispute_id', 'ground'])
export class DisputeLegalGround {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, name: 'dispute_id' })
  dispute_id: string;

  @Column({ type: 'enum', enum: LegalGround, nullable: false })
  ground: LegalGround;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'boolean', nullable: false, default: false })
  validated: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  // Relations
  @ManyToOne(() => DisputeCase, (disputeCase) => disputeCase.legal_grounds, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dispute_id' })
  dispute: DisputeCase;
}
