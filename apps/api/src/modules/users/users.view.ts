import type { User, UserRole, Role, Lab } from '@prisma/client';

type UserRowWithRelations = User & {
  roles: (UserRole & { role: Role })[];
  lab: Lab | null;
};

export interface UserView {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  wechatOpenId: string | null;
  labId: string | null;
  lab: { id: string; name: string; building: string | null } | null;
  roles: string[];
  createdAt: Date;
  updatedAt: Date;
}

export function toUserView(row: UserRowWithRelations): UserView {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    wechatOpenId: row.wechatOpenId,
    labId: row.labId,
    lab: row.lab
      ? { id: row.lab.id, name: row.lab.name, building: row.lab.building }
      : null,
    roles: row.roles.map((ur) => ur.role.code),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toUserViews(rows: UserRowWithRelations[]): UserView[] {
  return rows.map(toUserView);
}
