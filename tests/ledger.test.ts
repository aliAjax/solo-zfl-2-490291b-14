import {
  adjustValuationRecord,
  estimateKeyboardValue,
  dedupeValuations,
  computePolicyAllocation,
  getClaimableAmount,
  validateClaim,
  getPolicyStatus,
} from '@/utils/ledger';
import { sampleValuations, samplePolicies, sampleClaims } from '@/data/sampleData';
import type { ValuationRecord, InsurancePolicy, ClaimRecord } from '@/types';

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log('  ✓ ' + msg);
  } else {
    failed++;
    console.error('  ✗ ' + msg);
  }
}
function eq(a: unknown, b: unknown, msg: string) {
  assert(JSON.stringify(a) === JSON.stringify(b), `${msg}（期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}）`);
}

const V = (over: Partial<ValuationRecord>): ValuationRecord => ({
  id: 'v1',
  keyboardId: 'kb1',
  source: 'market',
  date: '2026-09-01',
  amount: 1000,
  condition: 'mint',
  boxPapers: 'full',
  modAdjustment: 0,
  note: '',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

console.log('== 估值修正 ==');
// (报价 + 改装) × 成色 × 箱说
eq(adjustValuationRecord(V({ amount: 5200, modAdjustment: 300, condition: 'excellent', boxPapers: 'full' })), 4950, '5200+300 × 0.9 × 1.0 = 4950');
eq(adjustValuationRecord(V({ amount: 1400, modAdjustment: -100, condition: 'good', boxPapers: 'box_only' })), 988, '(1400-100) × 0.8 × 0.95 = 988');
eq(adjustValuationRecord(V({ amount: 100, modAdjustment: -500 })), 0, '负值截断为 0');

console.log('== 加权区间与待核 ==');
{
  const est = estimateKeyboardValue([V({ amount: 2000 })]);
  eq(est.mid, 2000, '单条记录中枢 = 修正值');
  eq(est.low, 1800, '单条记录下限 -10%');
  eq(est.high, 2200, '单条记录上限 +10%');
  eq(est.status, 'valued', 'market 权重 1.0 ≥ 0.8 → 有效');
}
{
  const est = estimateKeyboardValue([V({ source: 'self', amount: 2000 })]);
  eq(est.status, 'pending', '仅自评（权重 0.4）→ 待核');
}
{
  const est = estimateKeyboardValue([V({ source: 'community', amount: 2000 })]);
  eq(est.status, 'pending', '仅社区估价（权重 0.6）→ 待核');
}
{
  const est = estimateKeyboardValue([
    V({ source: 'self', amount: 2000, id: 'a' }),
    V({ source: 'self', amount: 2000, id: 'b', date: '2026-09-02' }),
  ]);
  eq(est.status, 'valued', '两条自评（权重 0.8）→ 有效');
}
{
  const est = estimateKeyboardValue([]);
  eq(est.status, 'none', '无记录 → none');
}
{
  // 两条记录：加权均值 ± 加权标准差
  const est = estimateKeyboardValue([
    V({ source: 'market', amount: 1000, id: 'a' }),
    V({ source: 'self', amount: 2000, id: 'b', date: '2026-09-02' }),
  ]);
  // mid = (1000*1 + 2000*0.4)/1.4 = 1285.71 → 1286
  eq(est.mid, 1286, '两条记录加权中枢');
  assert(est.low < est.mid && est.high > est.mid, '区间包含中枢');
}

console.log('== 同一天同一来源只留最新 ==');
{
  const records = dedupeValuations([
    V({ id: 'old', amount: 1000, createdAt: '2026-09-01T08:00:00.000Z' }),
    V({ id: 'new', amount: 1200, createdAt: '2026-09-01T09:00:00.000Z' }),
    V({ id: 'other-source', source: 'dealer', amount: 900, createdAt: '2026-09-01T07:00:00.000Z' }),
    V({ id: 'other-day', date: '2026-08-31', amount: 800, createdAt: '2026-08-31T09:00:00.000Z' }),
  ]);
  eq(records.length, 3, '同日同来源去重后剩 3 条');
  assert(records.some((r) => r.id === 'new') && !records.some((r) => r.id === 'old'), '保留最新 createdAt 的记录');
}

console.log('== 示例数据估值（与手算对照） ==');
{
  const est1 = estimateKeyboardValue(sampleValuations.filter((v) => v.keyboardId === 'sample-1'));
  eq(est1.mid, 4743, 'sample-1 加权中枢 4743');
  eq(est1.low, 4312, 'sample-1 区间下限 4312');
  eq(est1.high, 5173, 'sample-1 区间上限 5173');
  eq(est1.status, 'valued', 'sample-1 有效');

  const est2 = estimateKeyboardValue(sampleValuations.filter((v) => v.keyboardId === 'sample-2'));
  eq(est2.mid, 1053, 'sample-2 加权中枢 1053');
  eq(est2.low, 950, 'sample-2 区间下限 950');
  eq(est2.high, 1156, 'sample-2 区间上限 1156');

  const est3 = estimateKeyboardValue(sampleValuations.filter((v) => v.keyboardId === 'sample-3'));
  eq(est3.status, 'pending', 'sample-3 仅自评 → 待核');
  eq(est3.mid, 2160, 'sample-3 中枢 2160');
}

console.log('== 比例分摊 ==');
{
  const estimates = new Map([
    ['sample-1', estimateKeyboardValue(sampleValuations.filter((v) => v.keyboardId === 'sample-1'))],
    ['sample-2', estimateKeyboardValue(sampleValuations.filter((v) => v.keyboardId === 'sample-2'))],
    ['sample-3', estimateKeyboardValue(sampleValuations.filter((v) => v.keyboardId === 'sample-3'))],
  ]);
  const alloc = computePolicyAllocation(samplePolicies[0], estimates);
  eq(alloc.totalBasis, 5796, '覆盖估值合计 5796');
  eq(alloc.overLimit, true, '5796 > 5000 → 超额');
  const r1 = alloc.rows.find((r) => r.keyboardId === 'sample-1')!;
  const r2 = alloc.rows.find((r) => r.keyboardId === 'sample-2')!;
  eq(r1.allocated, 4091, 'sample-1 分摊 4091（按占比压缩）');
  eq(r2.allocated, 908, 'sample-2 分摊 908');
  eq(alloc.totalAllocated, 4999, '分摊总额 4999 ≤ 额度 5000');
  assert(alloc.totalAllocated <= samplePolicies[0].coverageLimit, '总额不超过保单额度');
  eq(r1.gap, 652, 'sample-1 缺口 652');
  eq(r2.gap, 145, 'sample-2 缺口 145');
  assert(Math.abs(r1.share - 4743 / 5796) < 1e-9, '占比 = 估值占比');

  // 不超额度时足额分摊
  const bigPolicy: InsurancePolicy = { ...samplePolicies[0], id: 'pol-big', coverageLimit: 10000 };
  const alloc2 = computePolicyAllocation(bigPolicy, estimates);
  eq(alloc2.overLimit, false, '额度充足 → 不超额');
  eq(alloc2.rows.find((r) => r.keyboardId === 'sample-1')!.allocated, 4743, '足额分摊 4743');
  eq(alloc2.totalAllocated, 5796, '总额 = 估值合计');

  // 待核键盘不参与分摊
  const pendingPolicy: InsurancePolicy = { ...samplePolicies[0], id: 'pol-p', coveredKeyboardIds: ['sample-1', 'sample-3'] };
  const alloc3 = computePolicyAllocation(pendingPolicy, estimates);
  eq(alloc3.rows.find((r) => r.keyboardId === 'sample-3')!.allocated, 0, '待核键盘分摊为 0');
  eq(alloc3.totalBasis, 4743, '待核键盘不计入估值合计');
}

console.log('== 理赔校验 ==');
{
  const estimates = new Map([
    ['sample-1', estimateKeyboardValue(sampleValuations.filter((v) => v.keyboardId === 'sample-1'))],
    ['sample-2', estimateKeyboardValue(sampleValuations.filter((v) => v.keyboardId === 'sample-2'))],
  ]);
  const policy = samplePolicies[0];

  const claimable = getClaimableAmount(policy, estimates, sampleClaims, 'sample-2');
  eq(claimable.allocated, 908, 'sample-2 分摊保额 908');
  eq(claimable.used, 500, '已赔付 500');
  eq(claimable.remaining, 408, '剩余保额 408');
  eq(claimable.maxPayable, 208, '扣除免赔额 200 后可报 208');

  // 超额报案
  const over = validateClaim(policy, estimates, sampleClaims, {
    keyboardId: 'sample-2', incidentId: 'INC-NEW', incidentDate: '2026-09-15', amount: 300, note: '',
  });
  eq(over.ok, false, '报案 300 > 208 → 拒绝');
  assert(over.reason!.includes('208'), '拒绝原因包含可报上限');

  // 边界：恰好等于上限可以
  const exact = validateClaim(policy, estimates, sampleClaims, {
    keyboardId: 'sample-2', incidentId: 'INC-NEW', incidentDate: '2026-09-15', amount: 208, note: '',
  });
  eq(exact.ok, true, '报案 208 = 上限 → 通过');

  // 重复赔付：同一事故编号已有有效报案
  const dup = validateClaim(policy, estimates, sampleClaims, {
    keyboardId: 'sample-2', incidentId: 'INC-2026-001', incidentDate: '2026-09-15', amount: 100, note: '',
  });
  eq(dup.ok, false, '同一事故编号 → 重复赔付拦截');
  assert(dup.reason!.includes('重复'), '拒绝原因说明重复赔付');

  // 拒赔记录不占用事故编号
  const rejectedClaim: ClaimRecord = {
    id: 'clm-x', policyId: policy.id, keyboardId: 'sample-2', incidentId: 'INC-REJ',
    incidentDate: '2026-09-01', amount: 999, status: 'rejected', reason: '超额', note: '', createdAt: '2026-09-01T00:00:00Z',
  };
  const afterRejected = validateClaim(policy, estimates, [...sampleClaims, rejectedClaim], {
    keyboardId: 'sample-2', incidentId: 'INC-REJ', incidentDate: '2026-09-15', amount: 100, note: '',
  });
  eq(afterRejected.ok, true, '曾被拒赔的事故编号可重新报案');

  // 不在覆盖范围
  const notCovered = validateClaim(policy, estimates, sampleClaims, {
    keyboardId: 'sample-3', incidentId: 'INC-X', incidentDate: '2026-09-15', amount: 100, note: '',
  });
  eq(notCovered.ok, false, '未覆盖键盘 → 拒绝');

  // 赔付后剩余额度联动
  const paidClaim: ClaimRecord = {
    id: 'clm-y', policyId: policy.id, keyboardId: 'sample-2', incidentId: 'INC-PAID',
    incidentDate: '2026-09-10', amount: 208, status: 'paid', reason: '', note: '', createdAt: '2026-09-10T00:00:00Z',
  };
  const after = getClaimableAmount(policy, estimates, [...sampleClaims, paidClaim], 'sample-2');
  eq(after.remaining, 200, '再次赔付后剩余 200');
  eq(after.maxPayable, 0, '扣除免赔额后可报 0');
}

console.log('== 跨保单重复赔付 ==');
{
  const estimates = new Map([
    ['sample-1', estimateKeyboardValue(sampleValuations.filter((v) => v.keyboardId === 'sample-1'))],
    ['sample-2', estimateKeyboardValue(sampleValuations.filter((v) => v.keyboardId === 'sample-2'))],
  ]);
  const oldPolicy = samplePolicies[0];
  // 续保生成的新保单：同样覆盖 sample-1 / sample-2
  const renewedPolicy: InsurancePolicy = { ...oldPolicy, id: 'pol-renewed', renewedFromId: oldPolicy.id };

  const paidOnOld: ClaimRecord = {
    id: 'clm-cross', policyId: oldPolicy.id, keyboardId: 'sample-1', incidentId: 'INC-CROSS',
    incidentDate: '2026-09-01', amount: 1000, status: 'paid', reason: '', note: '',
    createdAt: '2026-09-01T00:00:00Z',
  };
  const withPaid = [...sampleClaims, paidOnOld];

  // 同一事故编号去新保单报案 → 拒赔
  const crossDup = validateClaim(renewedPolicy, estimates, withPaid, {
    keyboardId: 'sample-1', incidentId: 'INC-CROSS', incidentDate: '2026-09-15', amount: 100, note: '',
  });
  eq(crossDup.ok, false, '旧保单已赔付的事故在新保单报案 → 拒赔');
  assert(crossDup.reason!.includes('重复赔付'), '拒赔原因说明重复赔付');

  // 不同键盘、不同保单，同一事故编号 → 仍拒赔（全范围唯一）
  const crossOtherKb = validateClaim(renewedPolicy, estimates, withPaid, {
    keyboardId: 'sample-2', incidentId: 'INC-CROSS', incidentDate: '2026-09-15', amount: 100, note: '',
  });
  eq(crossOtherKb.ok, false, '同一事故编号跨键盘跨保单 → 仍拒赔');

  // 拒赔记录不占用事故编号：旧保单上被拒过的事故，新保单可正常报案
  const rejectedOnOld: ClaimRecord = {
    ...paidOnOld, id: 'clm-cross-rej', incidentId: 'INC-REJ2', status: 'rejected', reason: '超额',
  };
  const afterRej = validateClaim(renewedPolicy, estimates, [...withPaid, rejectedOnOld], {
    keyboardId: 'sample-1', incidentId: 'INC-REJ2', incidentDate: '2026-09-15', amount: 100, note: '',
  });
  eq(afterRej.ok, true, '拒赔记录不占号，同一事故编号可重报');

  // 不同事故在新保单继续赔付
  const newIncident = validateClaim(renewedPolicy, estimates, withPaid, {
    keyboardId: 'sample-1', incidentId: 'INC-NEW-2', incidentDate: '2026-09-15', amount: 100, note: '',
  });
  eq(newIncident.ok, true, '不同事故编号在新保单可正常赔付');

  // 单保单规则不变：新保单自己的剩余保额独立计算（sample-1 分摊 4091，新保单无赔付记录）
  const claimable = getClaimableAmount(renewedPolicy, estimates, withPaid, 'sample-1');
  eq(claimable.allocated, 4091, '新保单 sample-1 分摊 4091');
  eq(claimable.used, 0, '旧保单的赔付不计入新保单已用额度');
  eq(claimable.maxPayable, 3891, '新保单可报上限 = 4091 - 200 免赔');
}

console.log('== 保单状态（续保不空窗） ==');
{
  const oldPol: InsurancePolicy = {
    id: 'p1', name: 'A', insurer: 'x', policyNo: 'n', coverageLimit: 1000, deductible: 0,
    startDate: '2026-01-01', endDate: '2026-12-31', coveredKeyboardIds: [], renewedFromId: null,
    createdAt: '', updatedAt: '',
  };
  const newPol: InsurancePolicy = {
    ...oldPol, id: 'p2', renewedFromId: 'p1', startDate: '2027-01-01', endDate: '2027-12-31',
  };
  const all = [newPol, oldPol];
  eq(getPolicyStatus(oldPol, all, '2026-09-15'), 'active', '被续保的旧保单到期前仍生效');
  eq(getPolicyStatus(oldPol, all, '2027-01-01'), 'renewed', '旧保单过期后标记已续保');
  eq(getPolicyStatus(newPol, all, '2026-09-15'), 'pending', '新保单未到起期 → 未生效');
  eq(getPolicyStatus(newPol, all, '2027-06-01'), 'active', '新保单到起期后生效');
  eq(
    getPolicyStatus({ ...oldPol, id: 'p3', endDate: '2026-01-01' }, all, '2026-09-15'),
    'expired',
    '未被续保且已过期 → 已过期',
  );
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
