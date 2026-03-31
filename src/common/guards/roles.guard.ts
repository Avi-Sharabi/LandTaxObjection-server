import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../api/users/entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';

interface AuthenticatedRequest {
  user: { role: UserRole };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (user?.role === UserRole.ADMIN) {
      return true;
    }

    if (!requiredRoles.includes(user?.role)) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }

    return true;
  }
}
