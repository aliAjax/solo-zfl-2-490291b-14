import { useMemo, useState } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldQuestion,
  RefreshCw,
  List,
  Plus,
  FilePlus2,
  ScrollText,
  Landmark,
  Coins,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import {
  estimateKeyboardValue,
  computePolicyAllocation,
  getPolicyStatus,
  type ValuationEstimate,
  type PolicyAllocation,
} from '@/utils/ledger';
import { formatMoney } from '@/utils/helpers';
import type { InsurancePolicy } from '@/types';
import ValuationPanel from './ValuationPanel';
import PolicyPanel from './PolicyPanel';
import ClaimPanel from './ClaimPanel';
import ValuationFormModal from './ValuationFormModal';
import PolicyFormModal from './PolicyFormModal';
import ClaimFormModal from './ClaimFormModal';

type InsuranceTab = 'policies' | 'valuations' | 'claims';

interface PolicyModalState {
  mode: 'create' | 'edit' | 'renew';
  policy?: InsurancePolicy;
}

export default function InsuranceView() {
  const {
    logs,
    valuations,
    policies,
    claims,
    setViewMode,
    refreshFromStorage,
  } = useAppStore();

  const [tab, setTab] = useState<InsuranceTab>('policies');
  const [valuationModal, setValuationModal] = useState<{ keyboardId?: string } | null>(null);
  const [policyModal, setPolicyModal] = useState<PolicyModalState | null>(null);
  const [claimModal, setClaimModal] = useState<{ policyId: string; keyboardId?: string } | null>(null);
  const [refreshed, setRefreshed] = useState(false);

  const keyboardName = useMemo(() => {
    const m = new Map<string, string>();
    logs.forEach((l) => m.set(l.id, l.name));
    return m;
  }, [logs]);

  /** 每把键盘的估值结论 */
  const estimates = useMemo(() => {
    const m = new Map<string, ValuationEstimate>();
    for (const log of logs) {
      m.set(log.id, estimateKeyboardValue(valuations.filter((v) => v.keyboardId === log.id)));
    }
    return m;
  }, [logs, valuations]);

  /** 每张保单的分摊结果 */
  const allocations = useMemo(() => {
    const m = new Map<string, PolicyAllocation>();
    for (const p of policies) {
      m.set(p.id, computePolicyAllocation(p, estimates));
    }
    return m;
  }, [policies, estimates]);

  const activePolicies = useMemo(
    () => policies.filter((p) => getPolicyStatus(p, policies) === 'active'),
    [policies],
  );

  /** 看板风险项：未保 / 超额 / 保障不足 */
  const risk = useMemo(() => {
    const uninsured = logs.filter(
      (log) => !activePolicies.some((p) => p.coveredKeyboardIds.includes(log.id)),
    );
    const overLimit = activePolicies
      .map((p) => {
        const alloc = allocations.get(p.id);
        return { policy: p, excess: (alloc?.totalBasis ?? 0) - p.coverageLimit };
      })
      .filter((x) => x.excess > 0);
    const underCovered: Array<{
      keyboardId: string;
      policy: InsurancePolicy;
      gap: number;
      pending: boolean;
    }> = [];
    for (const p of activePolicies) {
      const alloc = allocations.get(p.id);
      if (!alloc) continue;
      for (const row of alloc.rows) {
        if (row.estimate.status !== 'valued') {
          underCovered.push({ keyboardId: row.keyboardId, policy: p, gap: 0, pending: true });
        } else if (row.gap > 0) {
          underCovered.push({ keyboardId: row.keyboardId, policy: p, gap: row.gap, pending: false });
        }
      }
    }
    return { uninsured, overLimit, underCovered };
  }, [logs, activePolicies, allocations]);

  const totalValue = useMemo(() => {
    let sum = 0;
    estimates.forEach((e) => {
      if (e.status === 'valued') sum += e.mid;
    });
    return sum;
  }, [estimates]);

  const totalAllocated = activePolicies.reduce(
    (s, p) => s + (allocations.get(p.id)?.totalAllocated ?? 0),
    0,
  );

  const handleRefresh = () => {
    refreshFromStorage();
    setRefreshed(true);
    window.setTimeout(() => setRefreshed(false), 1500);
  };

  const summaryCards: Array<{ testId: string; label: string; value: string; tone: string }> = [
    { testId: 'summary-total-value', label: '藏品总估值', value: formatMoney(totalValue), tone: 'text-gradient-brass' },
    { testId: 'summary-allocated', label: '在保分摊总额', value: formatMoney(totalAllocated), tone: 'text-slateblue-300' },
    { testId: 'summary-uninsured', label: '未保键盘', value: String(risk.uninsured.length), tone: risk.uninsured.length ? 'text-wine-400' : 'text-moss-400' },
    { testId: 'summary-overlimit', label: '超额保单', value: String(risk.overLimit.length), tone: risk.overLimit.length ? 'text-wine-400' : 'text-moss-400' },
    { testId: 'summary-undercovered', label: '保障不足', value: String(risk.underCovered.length), tone: risk.underCovered.length ? 'text-brass-200' : 'text-moss-400' },
  ];

  const tabs: Array<{ key: InsuranceTab; label: string; icon: React.ReactNode }> = [
    { key: 'policies', label: `保单 (${policies.length})`, icon: <ScrollText className="h-3.5 w-3.5" /> },
    { key: 'valuations', label: `估值 (${valuations.length})`, icon: <Coins className="h-3.5 w-3.5" /> },
    { key: 'claims', label: `理赔 (${claims.length})`, icon: <Landmark className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setViewMode('list')} className="btn-ghost text-xs">
          <List className="h-3.5 w-3.5" />
          返回列表
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="btn-ghost text-xs"
            title="从本地存储重新加载数据"
            data-testid="refresh-button"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshed ? 'animate-spin' : ''}`} />
            {refreshed ? '已刷新' : '刷新'}
          </button>
          <button onClick={() => setValuationModal({})} className="btn-ghost text-xs" data-testid="open-valuation-modal">
            <Plus className="h-3.5 w-3.5" />
            记估值
          </button>
          <button
            onClick={() => setPolicyModal({ mode: 'create' })}
            className="btn-primary !px-4 !py-2 text-xs"
            data-testid="open-policy-modal"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            新建保单
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {summaryCards.map((c) => (
          <div key={c.testId} className="card-surface p-4">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-500 mb-1.5">
              {c.label}
            </div>
            <div className={`font-mono text-xl font-bold ${c.tone}`} data-testid={c.testId}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="risk-board">
        <div className="card-surface p-4 sm:p-5" data-testid="risk-uninsured">
          <div className="flex items-center gap-2 mb-3">
            <ShieldQuestion className="h-4 w-4 text-wine-400" />
            <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-wine-400">
              未保键盘
            </h3>
            <span className="ml-auto font-mono text-xs text-ink-500">{risk.uninsured.length}</span>
          </div>
          {risk.uninsured.length === 0 ? (
            <p className="text-xs text-ink-500">全部键盘均已在保 ✓</p>
          ) : (
            <ul className="space-y-2">
              {risk.uninsured.map((log) => {
                const est = estimates.get(log.id);
                return (
                  <li key={log.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-ink-200 truncate">{log.name}</span>
                    <span className="font-mono text-[10px] text-ink-500 shrink-0">
                      {est?.status === 'valued'
                        ? formatMoney(est.mid)
                        : est?.status === 'pending'
                          ? '估值待核'
                          : '无估值'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card-surface p-4 sm:p-5" data-testid="risk-overlimit">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="h-4 w-4 text-wine-400" />
            <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-wine-400">
              超额保单
            </h3>
            <span className="ml-auto font-mono text-xs text-ink-500">{risk.overLimit.length}</span>
          </div>
          {risk.overLimit.length === 0 ? (
            <p className="text-xs text-ink-500">在保保单额度均可覆盖估值 ✓</p>
          ) : (
            <ul className="space-y-2">
              {risk.overLimit.map(({ policy, excess }) => (
                <li key={policy.id} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink-200 truncate">{policy.name}</span>
                    <span className="font-mono text-[10px] text-wine-400 shrink-0">
                      超出 {formatMoney(excess)}
                    </span>
                  </div>
                  <div className="text-[10px] text-ink-500 font-mono">
                    额度 {formatMoney(policy.coverageLimit)}，已按估值占比压缩分摊
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card-surface p-4 sm:p-5" data-testid="risk-undercovered">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4 text-brass-200" />
            <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-brass-200">
              保障不足
            </h3>
            <span className="ml-auto font-mono text-xs text-ink-500">{risk.underCovered.length}</span>
          </div>
          {risk.underCovered.length === 0 ? (
            <p className="text-xs text-ink-500">在保键盘均已足额覆盖 ✓</p>
          ) : (
            <ul className="space-y-2">
              {risk.underCovered.map((item, i) => (
                <li key={`${item.keyboardId}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-ink-200 truncate">
                    {keyboardName.get(item.keyboardId) ?? '未知键盘'}
                  </span>
                  <span className="font-mono text-[10px] shrink-0">
                    {item.pending ? (
                      <span className="text-brass-200">估值待核</span>
                    ) : (
                      <span className="text-wine-400">缺口 {formatMoney(item.gap)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-lg bg-ink-800/80 border border-ink-700/60 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              tab === t.key
                ? 'bg-brass-300/20 text-brass-100 border border-brass-300/30'
                : 'text-ink-400 hover:text-ink-200'
            }`}
            data-testid={`tab-${t.key}`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'policies' && (
        <PolicyPanel
          allocations={allocations}
          keyboardName={keyboardName}
          onEdit={(policy) => setPolicyModal({ mode: 'edit', policy })}
          onRenew={(policy) => setPolicyModal({ mode: 'renew', policy })}
          onFileClaim={(policyId, keyboardId) => setClaimModal({ policyId, keyboardId })}
          onCreate={() => setPolicyModal({ mode: 'create' })}
        />
      )}

      {tab === 'valuations' && (
        <ValuationPanel
          estimates={estimates}
          onAdd={(keyboardId) => setValuationModal({ keyboardId })}
        />
      )}

      {tab === 'claims' && <ClaimPanel keyboardName={keyboardName} />}

      {valuationModal && (
        <ValuationFormModal
          defaultKeyboardId={valuationModal.keyboardId}
          onClose={() => setValuationModal(null)}
        />
      )}

      {policyModal && (
        <PolicyFormModal
          mode={policyModal.mode}
          policy={policyModal.policy}
          estimates={estimates}
          onClose={() => setPolicyModal(null)}
        />
      )}

      {claimModal && (
        <ClaimFormModal
          policyId={claimModal.policyId}
          defaultKeyboardId={claimModal.keyboardId}
          estimates={estimates}
          onClose={() => setClaimModal(null)}
        />
      )}
    </div>
  );
}
