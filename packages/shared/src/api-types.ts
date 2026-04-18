export type RoleCode =
  | 'PLAIN_USER'
  | 'LAB_HEAD'
  | 'REAGENT_ADMIN'
  | 'SAFETY_OFFICER'
  | 'SYS_ADMIN';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  labId?: string | null;
  roles: RoleCode[];
}
