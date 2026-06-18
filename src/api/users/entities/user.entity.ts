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
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  email: string;

  @Column({ name: 'full_name', type: 'text' })
  fullName: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.ACCOUNTANT,
  })
  role: UserRole;

  @Column({ type: 'text', nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true, select: false })
  password: string | null;

  @Column({ name: 'password_reset_token', type: 'text', nullable: true, select: false })
  passwordResetToken: string | null;

  @Column({ name: 'password_reset_expires', type: 'timestamptz', nullable: true, select: false })
  passwordResetExpires: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}