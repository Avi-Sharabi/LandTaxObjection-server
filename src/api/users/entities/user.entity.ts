import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum UserRole {
  ACCOUNTANT = 'accountant',
  ADMIN = 'admin',
  INTERNAL_Assessor = 'Internal Assessor',
}

export enum ClientStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
}

@Entity('users')
export class User {
  @ApiProperty({ description: 'User ID (UUID)', example: '550e8400-e29b-41d4-a716-446655440000' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'User email address', example: 'accountant@example.com' })
  @Column({ type: 'text', nullable: false, unique: true })
  email: string;

  @ApiProperty({ description: 'Full name of the user', example: 'John Doe' })
  @Column({ type: 'text', nullable: false })
  full_name: string;

  @ApiProperty({ description: 'User role', enum: UserRole, example: UserRole.ACCOUNTANT })
  @Column({ type: 'enum', enum: UserRole, nullable: false, default: UserRole.ACCOUNTANT })
  role: UserRole;

  @ApiProperty({ description: 'Phone number', example: '+61 2 1234 5678', nullable: true })
  @Column({ type: 'text', nullable: true })
  phone: string | null;

  @ApiProperty({ description: 'Mobile number', example: '+61 4 1234 5678', nullable: true })
  @Column({ type: 'text', nullable: true })
  mobile: string | null;

  // Address
  @ApiProperty({ description: 'Street address', nullable: true })
  @Column({ type: 'text', nullable: true })
  address: string | null;

  @ApiProperty({ description: 'City', nullable: true })
  @Column({ type: 'text', nullable: true })
  city: string | null;

  @ApiProperty({ description: 'State or region', nullable: true })
  @Column({ type: 'text', nullable: true })
  region: string | null;

  @ApiProperty({ description: 'Postcode', nullable: true })
  @Column({ type: 'text', nullable: true })
  postcode: string | null;

  @ApiProperty({ description: 'Country', nullable: true })
  @Column({ type: 'text', nullable: true })
  country: string | null;

  // Business
  @ApiProperty({ description: 'ABN or business number', nullable: true })
  @Column({ type: 'text', nullable: true })
  business_number: string | null;

  @ApiProperty({ description: 'ACN or company number', nullable: true })
  @Column({ type: 'text', nullable: true })
  company_number: string | null;

  @ApiProperty({ description: 'Client code from FYI', nullable: true })
  @Column({ type: 'text', nullable: true })
  client_code: string | null;

  // FYI Metadata
  @ApiProperty({ description: 'FYI numeric client ID', nullable: true })
  @Column({ type: 'text', nullable: true })
  fyi_id: string | null;

  @ApiProperty({ description: 'FYI client UUID', nullable: true })
  @Column({ type: 'text', nullable: true })
  fyi_uuid: string | null;

  @ApiProperty({ description: 'Source system (e.g. XPM)', nullable: true })
  @Column({ type: 'text', nullable: true })
  source: string | null;

  @ApiProperty({ description: 'ID in the source system', nullable: true })
  @Column({ type: 'text', nullable: true })
  source_id: string | null;

  @ApiProperty({ description: 'Email of the FYI manager user', nullable: true })
  @Column({ type: 'text', nullable: true })
  fyi_manager_email: string | null;

  @ApiProperty({ description: 'Email of the FYI partner user', nullable: true })
  @Column({ type: 'text', nullable: true })
  fyi_partner_email: string | null;

  // Internal
  @ApiProperty({ description: 'Client status', enum: ClientStatus, nullable: true })
  @Column({ type: 'enum', enum: ClientStatus, nullable: true })
  status: ClientStatus | null;

  @ApiProperty({ description: 'Assigned accountant user ID', nullable: true })
  @Column({ type: 'uuid', nullable: true })
  assigned_accountant_id: string | null;

  @ApiProperty({ description: 'Whether the user is active', example: true })
  @Column({ type: 'boolean', nullable: false, default: true })
  is_active: boolean;

  @ApiProperty({ description: 'Timestamp when user was created', example: '2026-03-11T10:30:00Z' })
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}