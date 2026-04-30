import { AuthResponseDto } from '../../api/auth/dto/auth-response.dto';

export interface AuthenticatedRequest {
  user: AuthResponseDto;
  protocol: string;
  correlationId?: string;
  get: (header: string) => string;
}
