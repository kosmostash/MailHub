export type Role = "superadmin" | "admin" | "operator";

export type UserRow = {
  id: string;
  role: Role;
  admin_id: string | null;
  email: string;
  password_hash: string;
  disabled_at: Date | null;
  totp_secret: string | null;
  totp_enabled_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

/** The shape accounts take in API responses. Never carries hashes or secrets. */
export type PublicUser = {
  id: string;
  role: Role;
  adminId: string | null;
  email: string;
  disabled: boolean;
  disabledAt: string | null;
  totpEnabled: boolean;
  createdAt: string;
};

export const toPublicUser = (user: UserRow): PublicUser => ({
  id: user.id,
  role: user.role,
  adminId: user.admin_id,
  email: user.email,
  disabled: user.disabled_at !== null,
  disabledAt: user.disabled_at?.toISOString() ?? null,
  totpEnabled: user.totp_enabled_at !== null,
  createdAt: user.created_at.toISOString(),
});

/**
 * Who is acting (spec §2.2): `user` is the effective identity every permission and scope
 * check uses; `via` is the admin or superadmin behind an impersonation, or undefined.
 * */
export type Actor = {
  user: UserRow;
  via?: UserRow;
};
