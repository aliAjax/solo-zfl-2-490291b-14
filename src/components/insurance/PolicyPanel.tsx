import { Pencil, Trash2, RotateCcw, FilePlus2, Siren } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import {
  getPolicyStatus,
  POLICY_STATUS_LABELS,
  type PolicyAllocation,
} from '@/utils/ledger';
import { formatMoney } from '@/utils/helpers';
import type { InsurancePolicy } from '@/types';

interface Props {
  allocations: Map<string, PolicyAllocation>;
  keyboardName: Map<string, string>;
  onEdit: (policy: InsurancePolicy) => void;
  onRenew: (policy: InsurancePolicy) => void;
  onFileClaim: (policyId: string, keyboardId: string) => void;
  onCreate: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-moss-500/15 text-moss-400 border-moss-500/30',
  pending: 'bg-slateblue-500/15 text-slateblue-300 border-slateblue-500/30',
  expired: 'bg-ink-600/40 text-ink-400 border-ink-600/50',
  renewed: 'bg-brass-300/15 text-brass-200 border-brass-300/35',
};

export default function PolicyPanel({
  allocations,
  keyboardName,
  onEdit,
  onRenew,
  onFileClaim,
  onCreate,
}: Props) {
  const { policies, deletePolicy } = useAppStore();

  if (policies.length === 0) {
    return (
      <div className="card-surface flex flex-col items-center justify-center py-16 px-6 text-center">
        <h3 className="font-mono text-base font-semibold text-ink-200 mb-2">还没有保单</h3>
        <p className="text-sm text-ink-500 mb-6 max-w-sm">
          创建一份保单，按各键盘估值占比分摊保额，一份保单可覆盖多把键盘。
        </p>
        <button onClick={onCreate} className="btn-primary" data-testid="create-first-policy">
          <FilePlus2 className="h-4 w-4" />
          新建保单
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {policies.map((policy) => {
        const status = getPolicyStatus(policy, policies);
        const renewedBy = policies.find((p) => p.renewedFromId === policy.id);
        const alloc = allocations.get(policy.id);
        return (
          <div key={policy.id} className="card-surface p-4 sm:p-5" data-testid={`policy-card-${policy.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className="font-mono text-sm font-bold text-ink-100">{policy.name}</h3>
                  <span
                    className={`chip border !py-0.5 !text-[10px] ${STATUS_STYLES[status]}`}
                    data-testid={`policy-status-${policy.id}`}
                  >
                    {POLICY_STATUS_LABELS[status]}
                  </span>
                  {renewedBy && status === 'active' && (
                    <span
                      className="chip border !py-0.5 !text-[10px] bg-brass-300/15 text-brass-200 border-brass-300/35"
                      title={`已续接至「${renewedBy.name}」，本单保障至 ${policy.endDate}`}
                      data-testid={`policy-renewedby-${policy.id}`}
                    >
                      已续接
                    </span>
                  )}
                  {alloc?.overLimit && (
                    <span
                      className="chip border !py-0.5 !text-[10px] bg-wine-500/15 text-wine-400 border-wine-500/30"
                      data-testid={`policy-overlimit-${policy.id}`}
                    >
                      超额
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-ink-500 font-mono">
                  {policy.insurer} · 单号 {policy.policyNo} · {policy.startDate} ~ {policy.endDate}
                  {policy.renewedFromId && ' · 续保自旧保单'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onRenew(policy)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-ink-400 hover:text-brass-200 hover:bg-brass-300/10 transition-all"
                  title="续保：生成新保单并保留旧覆盖"
                  data-testid={`renew-policy-${policy.id}`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  续保
                </button>
                <button
                  onClick={() => onEdit(policy)}
                  className="p-1.5 rounded-md text-ink-500 hover:text-moss-400 hover:bg-moss-500/10 transition-all"
                  title="编辑"
                  data-testid={`edit-policy-${policy.id}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`确定删除保单「${policy.name}」吗？其下理赔记录将一并删除。`)) {
                      deletePolicy(policy.id);
                    }
                  }}
                  className="p-1.5 rounded-md text-ink-500 hover:text-wine-400 hover:bg-wine-500/10 transition-all"
                  title="删除"
                  data-testid={`delete-policy-${policy.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div className="rounded-lg bg-ink-900/60 border border-ink-700/60 p-2.5">
                <div className="text-[9px] font-mono uppercase tracking-wider text-ink-500 mb-0.5">保单额度</div>
                <div className="font-mono text-sm font-bold text-ink-100" data-testid={`policy-limit-${policy.id}`}>
                  {formatMoney(policy.coverageLimit)}
                </div>
              </div>
              <div className="rounded-lg bg-ink-900/60 border border-ink-700/60 p-2.5">
                <div className="text-[9px] font-mono uppercase tracking-wider text-ink-500 mb-0.5">免赔额</div>
                <div className="font-mono text-sm font-bold text-ink-100">
                  {formatMoney(policy.deductible)}
                </div>
              </div>
              <div className="rounded-lg bg-ink-900/60 border border-ink-700/60 p-2.5">
                <div className="text-[9px] font-mono uppercase tracking-wider text-ink-500 mb-0.5">覆盖估值合计</div>
                <div className={`font-mono text-sm font-bold ${alloc?.overLimit ? 'text-wine-400' : 'text-ink-100'}`} data-testid={`policy-total-basis-${policy.id}`}>
                  {formatMoney(alloc?.totalBasis ?? 0)}
                </div>
              </div>
              <div className="rounded-lg bg-ink-900/60 border border-ink-700/60 p-2.5">
                <div className="text-[9px] font-mono uppercase tracking-wider text-ink-500 mb-0.5">分摊总额</div>
                <div className="font-mono text-sm font-bold text-slateblue-300" data-testid={`policy-total-allocated-${policy.id}`}>
                  {formatMoney(alloc?.totalAllocated ?? 0)}
                </div>
              </div>
            </div>

            {alloc && alloc.rows.length > 0 ? (
              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-ink-500 border-b border-ink-700/60">
                      <th className="py-2 pr-3 font-medium">键盘</th>
                      <th className="py-2 pr-3 font-medium text-right">估值基数</th>
                      <th className="py-2 pr-3 font-medium text-right">占比</th>
                      <th className="py-2 pr-3 font-medium text-right">分摊保额</th>
                      <th className="py-2 pr-3 font-medium text-right">保障缺口</th>
                      <th className="py-2 font-medium text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alloc.rows.map((row) => (
                      <tr key={row.keyboardId} className="border-b border-ink-700/30 last:border-0" data-testid={`alloc-row-${policy.id}-${row.keyboardId}`}>
                        <td className="py-2 pr-3 text-ink-200 whitespace-nowrap">
                          {keyboardName.get(row.keyboardId) ?? '未知键盘'}
                          {row.estimate.status !== 'valued' && (
                            <span className="ml-1.5 text-[10px] font-mono text-brass-200">待核</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 font-mono text-ink-300 text-right" data-testid={`alloc-basis-${policy.id}-${row.keyboardId}`}>
                          {row.estimate.status === 'valued' ? formatMoney(row.basis) : '—'}
                        </td>
                        <td className="py-2 pr-3 font-mono text-ink-300 text-right" data-testid={`alloc-share-${policy.id}-${row.keyboardId}`}>
                          {(row.share * 100).toFixed(1)}%
                        </td>
                        <td className="py-2 pr-3 font-mono text-slateblue-300 text-right font-semibold" data-testid={`alloc-allocated-${policy.id}-${row.keyboardId}`}>
                          {formatMoney(row.allocated)}
                        </td>
                        <td className={`py-2 pr-3 font-mono text-right ${row.gap > 0 ? 'text-wine-400' : 'text-ink-500'}`} data-testid={`alloc-gap-${policy.id}-${row.keyboardId}`}>
                          {row.estimate.status === 'valued' ? (row.gap > 0 ? formatMoney(row.gap) : '足额') : '—'}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => onFileClaim(policy.id, row.keyboardId)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-ink-400 hover:text-wine-400 hover:bg-wine-500/10 transition-all"
                            data-testid={`file-claim-${policy.id}-${row.keyboardId}`}
                          >
                            <Siren className="h-3 w-3" />
                            报案
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-ink-500">该保单尚未覆盖任何键盘，点击编辑添加。</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
