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

export type HazardLevel = 'NORMAL' | 'DANGEROUS' | 'CONTROLLED';
export type ControlType =
  | 'DRUG_PRECURSOR'
  | 'EXPLOSIVE_PRECURSOR'
  | 'TOXIC'
  | 'NARCOTIC';

export interface ReagentSummary {
  id: string;
  name: string;
  cas?: string | null;
  formula?: string | null;
  specification?: string | null;
  category?: string | null;
  hazardLevel: HazardLevel;
  controlType?: ControlType | null;
  msdsFileUrl?: string | null;
}

export interface StockSummary {
  id: string;
  reagentId: string;
  labId: string;
  batchNo?: string | null;
  mfgDate?: string | null;
  expireDate?: string | null;
  initialQty: string;
  currentQty: string;
  unit: string;
  location?: string | null;
  supplier?: string | null;
}

export type RequestStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'ISSUED'
  | 'CANCELLED'
  | 'CLOSED';

export type ApprovalAction = 'APPROVE' | 'REJECT';

export interface RequestSummary {
  id: string;
  applicantId: string;
  labId: string;
  reagentId: string;
  stockId: string;
  quantity: string;
  unit: string;
  purpose: string;
  projectRef?: string | null;
  useLocation?: string | null;
  status: RequestStatus;
  rejectedReason?: string | null;
  createdAt: string;
}

export interface ApprovalSummary {
  id: string;
  requestId: string;
  approverId: string;
  action: ApprovalAction;
  comment?: string | null;
  createdAt: string;
}

export interface IssueSummary {
  id: string;
  requestId: string;
  issuerId: string;
  receiverId: string;
  stockId: string;
  actualQty: string;
  createdAt: string;
}
