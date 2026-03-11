import { IsString, IsEmail, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../entities/user.entity';

export class CreateUserDto {
    @ApiProperty({
        description: 'User email address',
        example: 'accountant@example.com',
    })
    @IsEmail()
    email: string;

    @ApiProperty({
        description: 'Full name of the user',
        example: 'John Doe',
    })
    @IsString()
    full_name: string;

    @ApiProperty({
        description: 'User role',
        enum: ['accountant', 'admin'],
        example: 'accountant',
    })
    @IsEnum(UserRole)
    role: UserRole;

    @ApiPropertyOptional({
        description: 'Phone number',
        example: '+61 2 1234 5678',
    })
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiPropertyOptional({
        description: 'Whether the user is active',
        default: true,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    is_active?: boolean;


}
