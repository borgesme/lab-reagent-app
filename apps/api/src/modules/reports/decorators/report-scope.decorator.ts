import { SetMetadata } from '@nestjs/common';
import type { ReportType } from '@app/shared';

export const REPORT_SCOPE_KEY = 'reportScopeType';
export const ReportScope = (type: ReportType) =>
  SetMetadata(REPORT_SCOPE_KEY, type);
