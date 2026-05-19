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

export interface ControlledLedgerRow {
  date: string;
  reagentName: string;
  batchNo: string;
  hazardLevel: string;
  controlType: string | null;
  applicant: string;
  projectRef: string;
  purpose: string;
  actualQty: string;
  unit: string;
  issuer: string;
  witness: string;
  signed: 'Y' | 'N';
  labId: string;
}

export interface ControlledLedgerSnapshotSummary {
  id: string;
  labId: string;
  yearMonth: string;
  rowCount: number;
  createdAt: string;
}

export type PurchaseRequestStatus = 'PENDING' | 'MERGED' | 'CANCELLED';
export type PurchaseBatchStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'RECEIVED'
  | 'CANCELLED';

export type NotificationType =
  | 'ALERT_EXPIRING'
  | 'ALERT_LOW_STOCK'
  | 'ALERT_RECONCILE'
  | 'PURCHASE_APPROVED'
  | 'PURCHASE_REJECTED'
  | 'PURCHASE_RECEIVED';

export interface PurchaseRequestSummary {
  id: string;
  applicantId: string;
  labId: string;
  reagentId: string;
  quantity: string;
  unit: string;
  reason: string;
  status: PurchaseRequestStatus;
  batchId?: string | null;
  createdAt: string;
}

export interface PurchaseBatchSummary {
  id: string;
  labId: string;
  reagentId: string;
  totalQty: string;
  unit: string;
  status: PurchaseBatchStatus;
  rejectedReason?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface PurchaseReceiptSummary {
  id: string;
  batchId: string;
  stockId: string;
  receivedBy: string;
  receivedAt: string;
  supplier?: string | null;
  purchasePrice?: string | null;
}

export interface LabReagentConfigSummary {
  id: string;
  labId: string;
  reagentId: string;
  safetyStock: string;
  expireWarningDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationSummary {
  id: string;
  recipientId: string;
  labId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  payload?: Record<string, unknown> | null;
  readAt?: string | null;
  emailedAt?: string | null;
  createdAt: string;
}

export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T | null;
}

export interface PageQuery {
  pageNum?: number;
  pageSize?: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  pageNum: number;
  pageSize: number;
}

export interface LabSummary {
  id: string;
  name: string;
  building?: string | null;
}
