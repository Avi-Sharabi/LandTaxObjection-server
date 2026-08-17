import { DomainException } from 'src/common/exceptions/domain.exception';

/**
 * The caller's role may not use the admin-only `force` override. No route-level guard can express
 * this, because it depends on the request body rather than the route.
 *
 * The message names the OVERRIDE, not the target status. It used to read "Role 'accountant' may
 * not move a dispute case to 'case_closed'", which is false — an accountant can, through the
 * normal path. Only the bypass is restricted.
 */
export class StatusTransitionForbiddenException extends DomainException {
  constructor(to: string, role: string, allowedRoles: readonly string[]) {
    super(
      'STATUS_TRANSITION_FORBIDDEN',
      `Role '${role}' may not FORCE a dispute case to '${to}'. Forcing bypasses the transition ` +
        `rules and runs no side effects, so it is restricted to: ${allowedRoles.join(', ')}. ` +
        'The move may still be available through a normal status change.',
      403,
    );
  }
}
