/** Roles that exist in the system. */
export type Role = "admin" | "supervisor" | "enumerator";

/** Shape of the JWT payload issued by AuthModule. */
export interface JwtPayload {
  sub: string; // user UUID
  email: string;
  role: Role;
  org_id: string;
  iat: number;
  exp: number;
}

/** Attached to req.user after JWT validation. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  org_id: string;
}
