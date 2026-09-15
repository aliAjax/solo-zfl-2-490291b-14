/* store 层核对：续保接续、估值去重、报案全链路、持久化（node + localStorage 桩） */
const mem = new Map<string, string>();
const localStorageStub: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'> = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageStub });

const { useAppStore } = await import('@/store/useAppStore');

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

console.log('== 初始数据 ==');
const s0 = useAppStore.getState();
assert(
  s0.logs.length === 4 && s0.valuations.length === 6 && s0.policies.length === 1 && s0.claims.length === 1,
  `初始示例数据（logs=${s0.logs.length} vals=${s0.valuations.length} pols=${s0.policies.length} claims=${s0.claims.length}）`,
);

console.log('== 续保：远期新单，旧单保障期不变 ==');
useAppStore.getState().renewPolicy('pol-1', {
  startDate: '2027-01-01',
  endDate: '2027-12-31',
  coverageLimit: 5000,
  deductible: 200,
});
const s1 = useAppStore.getState();
assert(s1.policies.length === 2, '续保后 2 张保单');
const oldPol = s1.policies.find((p) => p.id === 'pol-1')!;
assert(oldPol.endDate === '2026-12-31', `旧单保障期不变（${oldPol.endDate}）`);
const newPol = s1.policies.find((p) => p.renewedFromId === 'pol-1')!;
assert(
  newPol.coveredKeyboardIds.join(',') === oldPol.coveredKeyboardIds.join(','),
  '新单继承旧单覆盖键盘',
);
assert(newPol.coverageLimit === 5000 && newPol.deductible === 200, '新单继承额度与免赔额');

console.log('== 续保：立即生效，旧单保障期接续 ==');
useAppStore.getState().renewPolicy(newPol.id, {
  startDate: '2026-09-20',
  endDate: '2027-09-19',
  coverageLimit: 6000,
  deductible: 100,
});
const s2 = useAppStore.getState();
const midPol = s2.policies.find((p) => p.id === newPol.id)!;
assert(midPol.endDate === '2026-09-19', `旧单保障期接续到新单生效前一日（${midPol.endDate}）`);
assert(s2.policies.length === 3, '再次续保后 3 张保单');

console.log('== 估值：同一天同一来源只留最新 ==');
const beforeCount = useAppStore.getState().valuations.filter((v) => v.keyboardId === 'sample-3').length;
useAppStore.getState().addValuation({
  keyboardId: 'sample-3', source: 'market', date: '2026-09-15', amount: 3000,
  condition: 'mint', boxPapers: 'full', modAdjustment: 0, note: '',
});
useAppStore.getState().addValuation({
  keyboardId: 'sample-3', source: 'market', date: '2026-09-15', amount: 3200,
  condition: 'mint', boxPapers: 'full', modAdjustment: 0, note: '',
});
const after = useAppStore.getState().valuations.filter((v) => v.keyboardId === 'sample-3');
assert(after.length === beforeCount + 1, `同日同来源去重（${beforeCount} → ${after.length}）`);
assert(after.find((v) => v.source === 'market')!.amount === 3200, '保留最新金额 3200');

console.log('== 报案全链路 ==');
const r1 = useAppStore.getState().fileClaim('pol-1', {
  keyboardId: 'sample-2', incidentId: 'INC-T', incidentDate: '2026-09-15', amount: 300, note: '',
});
assert(!r1.ok, '超额报案 300 被拒');
const r2 = useAppStore.getState().fileClaim('pol-1', {
  keyboardId: 'sample-2', incidentId: 'INC-T', incidentDate: '2026-09-15', amount: 208, note: '',
});
assert(r2.ok, '限额内报案 208 通过');
const r3 = useAppStore.getState().fileClaim('pol-1', {
  keyboardId: 'sample-2', incidentId: 'INC-T', incidentDate: '2026-09-15', amount: 1, note: '',
});
assert(!r3.ok, '同一事故重复赔付被拒');
const paidCount = useAppStore.getState().claims.filter((c) => c.incidentId === 'INC-T' && c.status === 'paid').length;
assert(paidCount === 1, 'INC-T 仅一条有效赔付');

console.log('== 持久化 ==');
const storedClaims = JSON.parse(mem.get('keyfeeling-claims-v1')!);
assert(storedClaims.length === useAppStore.getState().claims.length, '理赔已写入 localStorage');
const storedPols = JSON.parse(mem.get('keyfeeling-policies-v1')!);
assert(storedPols.length === 3, '保单已写入 localStorage');
useAppStore.getState().refreshFromStorage();
assert(useAppStore.getState().claims.length === storedClaims.length, '刷新后数据一致');

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
