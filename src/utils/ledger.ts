import type {
  ValuationRecord,
  ValuationSource,
  ConditionGrade,
  BoxPapers,
  InsurancePolicy,
  ClaimRecord,
} from '@/types';
import {
  VALUATION_SOURCES,
  CONDITION_GRADES,
  BOX_PAPERS_OPTIONS,
} from '@/types';

/** 来源权重：越接近真实成交的来源权重越高 */
export const SOURCE_WEIGHTS: Record<ValuationSource, number> = {
  market: 1.0,
  auction: 0.9,
  dealer: 0.8,
  community: 0.6,
  self: 0.4,
};

/** 成色修正系数 */
export const CONDITION_FACTORS: Record<ConditionGrade, number> = {
  mint: 1,
  excellent: 0.9,
  good: 0.8,
  fair: 0.65,
  poor: 0.5,
};

/** 箱说修正系数 */
export const BOX_PAPERS_FACTORS: Record<BoxPapers, number> = {
  full: 1,
  box_only: 0.95,
  none: 0.88,
};

/** 证据充足所需的最低来源权重合计，低于则标为待核 */
export const EVIDENCE_WEIGHT_THRESHOLD = 0.8;

/** 单条记录时的不确定性带宽（±10%） */
const SINGLE_RECORD_BAND = 0.1;

export type ValuationStatus = 'none' | 'pending' | 'valued';

export interface ValuationEstimate {
  status: ValuationStatus;
  /** 估值区间下限 */
  low: number;
  /** 估值区间上限 */
  high: number;
  /** 加权中枢值 */
  mid: number;
  totalWeight: number;
  recordCount: number;
  /** 待核原因 */
  reasons: string[];
}

/** 单条估值记录的修正后价值：(报价 + 改装调整) × 成色系数 × 箱说系数 */
export function adjustValuationRecord(r: ValuationRecord): number {
  const base = Math.max(0, r.amount + r.modAdjustment);
  return base * CONDITION_FACTORS[r.condition] * BOX_PAPERS_FACTORS[r.boxPapers];
}

/**
 * 按来源权重与成色/箱说修正计算估值区间。
 * 证据不足（无记录或来源权重合计过低）时标为待核。
 */
export function estimateKeyboardValue(records: ValuationRecord[]): ValuationEstimate {
  if (records.length === 0) {
    return {
      status: 'none',
      low: 0,
      high: 0,
      mid: 0,
      totalWeight: 0,
      recordCount: 0,
      reasons: ['暂无估值记录'],
    };
  }

  const items = records.map((r) => ({
    w: SOURCE_WEIGHTS[r.source],
    v: adjustValuationRecord(r),
  }));
  const totalWeight = items.reduce((s, i) => s + i.w, 0);
  const mid = items.reduce((s, i) => s + i.w * i.v, 0) / totalWeight;

  let low: number;
  let high: number;
  if (items.length === 1) {
    low = items[0].v * (1 - SINGLE_RECORD_BAND);
    high = items[0].v * (1 + SINGLE_RECORD_BAND);
  } else {
    const variance =
      items.reduce((s, i) => s + i.w * (i.v - mid) ** 2, 0) / totalWeight;
    const std = Math.sqrt(variance);
    low = mid - std;
    high = mid + std;
  }

  const reasons: string[] = [];
  if (totalWeight < EVIDENCE_WEIGHT_THRESHOLD) {
    reasons.push(
      `来源权重合计 ${totalWeight.toFixed(1)} 低于 ${EVIDENCE_WEIGHT_THRESHOLD}，证据不足`,
    );
  }

  return {
    status: reasons.length > 0 ? 'pending' : 'valued',
    low: Math.max(0, Math.round(low)),
    high: Math.max(0, Math.round(high)),
    mid: Math.round(mid),
    totalWeight,
    recordCount: records.length,
    reasons,
  };
}

/**
 * 同一天同一来源只留最新记录（按 createdAt 比较）。
 * 返回按日期倒序排列的去重结果。
 */
export function dedupeValuations(records: ValuationRecord[]): ValuationRecord[] {
  const byKey = new Map<string, ValuationRecord>();
  for (const r of records) {
    const key = `${r.keyboardId}|${r.source}|${r.date}`;
    const prev = byKey.get(key);
    if (!prev || r.createdAt >= prev.createdAt) {
      byKey.set(key, r);
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
}

// ===== 保额分摊 =====

export interface AllocationRow {
  keyboardId: string;
  estimate: ValuationEstimate;
  /** 参与分摊的估值基数（待核/无估值为 0） */
  basis: number;
  /** 估值占比 0..1 */
  share: number;
  /** 分摊到的保额 */
  allocated: number;
  /** 保障缺口 = basis - allocated */
  gap: number;
}

export interface PolicyAllocation {
  totalBasis: number;
  /** 覆盖键盘估值合计是否超过保单额度 */
  overLimit: boolean;
  rows: AllocationRow[];
  totalAllocated: number;
}

/**
 * 保额按各键盘估值占比分摊，总额不超过保单额度。
 * 估值合计 ≤ 额度时按估值足额分摊；超过时按比例压缩（向下取整保证不超额度）。
 */
export function computePolicyAllocation(
  policy: InsurancePolicy,
  estimates: Map<string, ValuationEstimate>,
): PolicyAllocation {
  const rows: AllocationRow[] = policy.coveredKeyboardIds.map((id) => {
    const estimate = estimates.get(id) ?? estimateKeyboardValue([]);
    const basis = estimate.status === 'valued' ? estimate.mid : 0;
    return { keyboardId: id, estimate, basis, share: 0, allocated: 0, gap: 0 };
  });

  const totalBasis = rows.reduce((s, r) => s + r.basis, 0);
  const overLimit = totalBasis > policy.coverageLimit;
  const scale = overLimit && totalBasis > 0 ? policy.coverageLimit / totalBasis : 1;

  let totalAllocated = 0;
  const finalRows = rows.map((r) => {
    const share = totalBasis > 0 ? r.basis / totalBasis : 0;
    const allocated = overLimit ? Math.floor(r.basis * scale) : r.basis;
    totalAllocated += allocated;
    return { ...r, share, allocated, gap: r.basis - allocated };
  });

  return { totalBasis, overLimit, rows: finalRows, totalAllocated };
}

// ===== 理赔 =====

export interface ClaimInput {
  keyboardId: string;
  incidentId: string;
  incidentDate: string;
  amount: number;
  note: string;
}

export interface ClaimableAmount {
  allocated: number;
  used: number;
  remaining: number;
  /** 扣除免赔额后的可报上限 */
  maxPayable: number;
}

/** 某键盘在保单下扣除已赔付与免赔额后的剩余可报额度 */
export function getClaimableAmount(
  policy: InsurancePolicy,
  estimates: Map<string, ValuationEstimate>,
  claims: ClaimRecord[],
  keyboardId: string,
): ClaimableAmount {
  const alloc = computePolicyAllocation(policy, estimates);
  const row = alloc.rows.find((r) => r.keyboardId === keyboardId);
  const allocated = row?.allocated ?? 0;
  const used = claims
    .filter(
      (c) =>
        c.policyId === policy.id && c.keyboardId === keyboardId && c.status !== 'rejected',
    )
    .reduce((s, c) => s + c.amount, 0);
  const remaining = Math.max(0, allocated - used);
  const maxPayable = Math.max(0, remaining - policy.deductible);
  return { allocated, used, remaining, maxPayable };
}

/**
 * 校验报案：
 * - 键盘须在保单覆盖范围内
 * - 同一事故编号在所有保单范围内只能有一条有效赔付（拒赔记录不占号）
 * - 报案金额不能超过扣除免赔额后的剩余保额（按本保单计算）
 */
export function validateClaim(
  policy: InsurancePolicy,
  estimates: Map<string, ValuationEstimate>,
  claims: ClaimRecord[],
  input: ClaimInput,
): { ok: boolean; reason?: string } {
  if (!policy.coveredKeyboardIds.includes(input.keyboardId)) {
    return { ok: false, reason: '该键盘不在此保单的覆盖范围内' };
  }
  if (!input.incidentId.trim()) {
    return { ok: false, reason: '请填写事故编号' };
  }
  if (!(input.amount > 0)) {
    return { ok: false, reason: '报案金额必须大于 0' };
  }
  // 跨保单查重：同一事故编号在任意保单下已有有效赔付即拦截
  const duplicated = claims.some(
    (c) => c.incidentId.trim() === input.incidentId.trim() && c.status !== 'rejected',
  );
  if (duplicated) {
    return { ok: false, reason: '同一事故编号已存在有效赔付记录，不能重复赔付' };
  }
  const { maxPayable } = getClaimableAmount(policy, estimates, claims, input.keyboardId);
  if (input.amount > maxPayable) {
    return {
      ok: false,
      reason: `超出扣除免赔额后的剩余保额，最多可报 ¥${maxPayable.toLocaleString('zh-CN')}`,
    };
  }
  return { ok: true };
}

// ===== 保单状态 =====

export type PolicyStatus = 'active' | 'pending' | 'expired' | 'renewed';

export const POLICY_STATUS_LABELS: Record<PolicyStatus, string> = {
  active: '生效中',
  pending: '未生效',
  expired: '已过期',
  renewed: '已续保',
};

/**
 * 保单状态：被续保的旧保单在到期前仍然生效（保障不空窗），
 * 「已续保」仅在过期后作为历史标记。
 */
export function getPolicyStatus(
  policy: InsurancePolicy,
  allPolicies: InsurancePolicy[],
  today: string = new Date().toISOString().slice(0, 10),
): PolicyStatus {
  if (policy.startDate > today) return 'pending';
  if (policy.endDate >= today) return 'active';
  if (allPolicies.some((p) => p.renewedFromId === policy.id)) return 'renewed';
  return 'expired';
}

export function isPolicyActive(
  policy: InsurancePolicy,
  allPolicies: InsurancePolicy[],
  today?: string,
): boolean {
  return getPolicyStatus(policy, allPolicies, today) === 'active';
}

// ===== 导入校验 =====

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && !isNaN(v) && isFinite(v);
}

export function validateValuationRecord(raw: unknown): { valid: boolean; reason?: string } {
  if (!isRecord(raw)) return { valid: false, reason: '不是有效的对象' };
  for (const f of ['id', 'keyboardId', 'source', 'date', 'note', 'createdAt', 'updatedAt'] as const) {
    if (typeof raw[f] !== 'string') return { valid: false, reason: `缺少或无效的字段: ${f}` };
  }
  for (const f of ['amount', 'modAdjustment'] as const) {
    if (!isFiniteNumber(raw[f])) return { valid: false, reason: `缺少或无效的字段: ${f}` };
  }
  if (!VALUATION_SOURCES.includes(raw.source as ValuationSource)) {
    return { valid: false, reason: `无效的估值来源: ${String(raw.source)}` };
  }
  if (!CONDITION_GRADES.includes(raw.condition as ConditionGrade)) {
    return { valid: false, reason: `无效的成色: ${String(raw.condition)}` };
  }
  if (!BOX_PAPERS_OPTIONS.includes(raw.boxPapers as BoxPapers)) {
    return { valid: false, reason: `无效的箱说状态: ${String(raw.boxPapers)}` };
  }
  return { valid: true };
}

export function validatePolicyRecord(raw: unknown): { valid: boolean; reason?: string } {
  if (!isRecord(raw)) return { valid: false, reason: '不是有效的对象' };
  for (const f of ['id', 'name', 'insurer', 'policyNo', 'startDate', 'endDate', 'createdAt', 'updatedAt'] as const) {
    if (typeof raw[f] !== 'string') return { valid: false, reason: `缺少或无效的字段: ${f}` };
  }
  for (const f of ['coverageLimit', 'deductible'] as const) {
    if (!isFiniteNumber(raw[f])) return { valid: false, reason: `缺少或无效的字段: ${f}` };
  }
  if (
    !Array.isArray(raw.coveredKeyboardIds) ||
    !raw.coveredKeyboardIds.every((x) => typeof x === 'string')
  ) {
    return { valid: false, reason: 'coveredKeyboardIds 必须是字符串数组' };
  }
  if (raw.renewedFromId !== null && typeof raw.renewedFromId !== 'string') {
    return { valid: false, reason: 'renewedFromId 必须是字符串或 null' };
  }
  return { valid: true };
}

export function validateClaimRecord(raw: unknown): { valid: boolean; reason?: string } {
  if (!isRecord(raw)) return { valid: false, reason: '不是有效的对象' };
  for (const f of ['id', 'policyId', 'keyboardId', 'incidentId', 'incidentDate', 'reason', 'note', 'createdAt'] as const) {
    if (typeof raw[f] !== 'string') return { valid: false, reason: `缺少或无效的字段: ${f}` };
  }
  if (!isFiniteNumber(raw.amount)) return { valid: false, reason: '缺少或无效的字段: amount' };
  if (raw.status !== 'paid' && raw.status !== 'rejected') {
    return { valid: false, reason: `无效的理赔状态: ${String(raw.status)}` };
  }
  return { valid: true };
}
