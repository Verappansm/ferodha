/**
 * The roles a token may carry, from contracts/auth-api.yaml. `CUSTOMER` is a
 * normal trading user, `ADMIN` an operator.
 *
 * A public registration route cannot ask the caller to declare one: accepting
 * `roles` in the body as authority is privilege escalation, and the Sprint 8
 * security review looks for exactly that.
 */
export enum Role {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
}

/** Everyone who registers themselves ends up here, whatever they asked for. */
export const DEFAULT_ROLES: Role[] = [Role.CUSTOMER];
