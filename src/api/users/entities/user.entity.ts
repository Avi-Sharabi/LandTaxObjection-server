import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum UserRole {
  ACCOUNTANT = 'accountant',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @ApiProperty({
    description: 'User ID (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'accountant@example.com',
  })
  @Column({ type: 'text', nullable: false, unique: true })
  email: string;

  @ApiProperty({
    description: 'Full name of the user',
    example: 'John Doe',
  })
  @Column({ type: 'text', nullable: false })
  full_name: string;

  @ApiProperty({
    description: 'User role',
    enum: ['accountant', 'admin'],
    example: 'accountant',
  })
  @Column({
    type: 'enum',
    enum: UserRole,
    nullable: false,
    default: UserRole.ACCOUNTANT,
  })
  role: UserRole;

  @ApiProperty({
    description: 'Phone number',
    example: '+61 2 1234 5678',
    nullable: true,
  })
  @Column({ type: 'text', nullable: true })
  phone: string | null;

  @ApiProperty({
    description: 'Whether the user is active',
    example: true,
  })
  @Column({ type: 'boolean', nullable: false, default: true })
  is_active: boolean;

  @ApiProperty({
    description: 'Timestamp when user was created',
    example: '2026-03-11T10:30:00Z',
  })
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
