import type { ReagentSummary } from './api-types';

export function isControlled(
  r: Pick<ReagentSummary, 'hazardLevel' | 'controlType'>,
): boolean {
  return r.hazardLevel === 'CONTROLLED' || r.controlType != null;
}
