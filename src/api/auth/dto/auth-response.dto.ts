import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../users/entities/user.entity';

export class AuthResponseDto {
  @ApiProperty({ example: 'uuid-here' })
  id: string;

  @ApiProperty({ example: 'pol.imbing@ymlgroup.com.au' })
  email: string;

  @ApiProperty({ example: 'Pol Imbing' })
  fullName: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;
}
