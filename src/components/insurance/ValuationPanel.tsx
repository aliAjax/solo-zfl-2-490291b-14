import { Plus, Trash2, BadgeCheck, BadgeAlert, BadgeMinus } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import {
  VALUATION_SOURCE_LABELS,
  CONDITION_LABELS,
  BOX_PAPERS_LABELS,
} from '@/types';
import {
  adjustValuationRecord,
  SOURCE_WEIGHTS,
  type ValuationEstimate,
} from '@/utils/ledger';
import { formatMoney, formatDate } from '@/utils/helpers';

interface Props {
  estimates: Map<string, ValuationEstimate>;
  onAdd: (keyboardId: string) => void;
}

export default function ValuationPanel({ estimates, onAdd }: Props) {
  const { logs, valuations, deleteValuation } = useAppStore();

  const statusBadge = (kbId: string) => {
    const est = estimates.get(kbId);
    if (!est || est.status === 'none') {
      return (
        <span className="chip border bg-ink-600/40 text-ink-400 border-ink-600/50" data-testid={`estimate-status-${kbId}`}>
          <BadgeMinus className="h-3 w-3" />
          无估值
        </span>
      );
    }
    if (est.status === 'pending') {
      return (
        <span className="chip border bg-brass-300/15 text-brass-200 border-brass-300/35" data-testid={`estimate-status-${kbId}`}>
          <BadgeAlert className="h-3 w-3" />
          待核
        </span>
      );
    }
    return (
      <span className="chip border bg-moss-500/15 text-moss-400 border-moss-500/30" data-testid={`estimate-status-${kbId}`}>
        <BadgeCheck className="h-3 w-3" />
        有效
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {logs.map((log) => {
        const est = estimates.get(log.id);
        const records = valuations
          .filter((v) => v.keyboardId === log.id)
          .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
        return (
          <div key={log.id} className="card-surface p-4 sm:p-5" data-testid={`valuation-card-${log.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-mono text-sm font-bold text-ink-100 truncate">{log.name}</h3>
                  {statusBadge(log.id)}
                </div>
                <p className="text-[11px] text-ink-500 font-mono">
                  {log.brand} {log.model}
                </p>
              </div>
              <button
                onClick={() => onAdd(log.id)}
                className="btn-ghost !px-3 !py-1.5 text-xs"
                data-testid={`add-valuation-${log.id}`}
              >
                <Plus className="h-3.5 w-3.5" />
                记估值
              </button>
            </div>

            {est && est.status !== 'none' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div className="rounded-lg bg-ink-900/60 border border-ink-700/60 p-2.5">
                  <div className="text-[9px] font-mono uppercase tracking-wider text-ink-500 mb-0.5">估值区间</div>
                  <div className="font-mono text-sm font-bold text-brass-200" data-testid={`estimate-range-${log.id}`}>
                    {formatMoney(est.low)} ~ {formatMoney(est.high)}
                  </div>
                </div>
                <div className="rounded-lg bg-ink-900/60 border border-ink-700/60 p-2.5">
                  <div className="text-[9px] font-mono uppercase tracking-wider text-ink-500 mb-0.5">加权中枢</div>
                  <div className="font-mono text-sm font-bold text-ink-100" data-testid={`estimate-mid-${log.id}`}>
                    {formatMoney(est.mid)}
                  </div>
                </div>
                <div className="rounded-lg bg-ink-900/60 border border-ink-700/60 p-2.5">
                  <div className="text-[9px] font-mono uppercase tracking-wider text-ink-500 mb-0.5">记录数</div>
                  <div className="font-mono text-sm font-bold text-ink-100" data-testid={`estimate-count-${log.id}`}>
                    {est.recordCount}
                  </div>
                </div>
                <div className="rounded-lg bg-ink-900/60 border border-ink-700/60 p-2.5">
                  <div className="text-[9px] font-mono uppercase tracking-wider text-ink-500 mb-0.5">来源权重</div>
                  <div className="font-mono text-sm font-bold text-ink-100">
                    {est.totalWeight.toFixed(1)}
                  </div>
                </div>
              </div>
            )}

            {est && est.status === 'pending' && (
              <div className="mb-3 rounded-lg bg-brass-300/8 border border-brass-300/25 px-3 py-2 text-[11px] text-brass-200">
                {est.reasons.join('；')}，请补充更高权重的来源（如二手成交、拍卖成交）
              </div>
            )}

            {records.length > 0 ? (
              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-ink-500 border-b border-ink-700/60">
                      <th className="py-2 pr-3 font-medium">日期</th>
                      <th className="py-2 pr-3 font-medium">来源</th>
                      <th className="py-2 pr-3 font-medium text-right">报价</th>
                      <th className="py-2 pr-3 font-medium">成色</th>
                      <th className="py-2 pr-3 font-medium">箱说</th>
                      <th className="py-2 pr-3 font-medium text-right">改装调整</th>
                      <th className="py-2 pr-3 font-medium text-right">修正后</th>
                      <th className="py-2 font-medium text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id} className="border-b border-ink-700/30 last:border-0" data-testid={`valuation-row-${r.id}`}>
                        <td className="py-2 pr-3 font-mono text-ink-300 whitespace-nowrap">{formatDate(r.date)}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <span className="text-ink-200">{VALUATION_SOURCE_LABELS[r.source]}</span>
                          <span className="text-ink-600 font-mono text-[10px] ml-1">×{SOURCE_WEIGHTS[r.source]}</span>
                        </td>
                        <td className="py-2 pr-3 font-mono text-ink-200 text-right">{formatMoney(r.amount)}</td>
                        <td className="py-2 pr-3 text-ink-300 whitespace-nowrap">{CONDITION_LABELS[r.condition]}</td>
                        <td className="py-2 pr-3 text-ink-300 whitespace-nowrap">{BOX_PAPERS_LABELS[r.boxPapers]}</td>
                        <td className={`py-2 pr-3 font-mono text-right ${r.modAdjustment >= 0 ? 'text-moss-400' : 'text-wine-400'}`}>
                          {r.modAdjustment >= 0 ? '+' : ''}{formatMoney(r.modAdjustment)}
                        </td>
                        <td className="py-2 pr-3 font-mono text-brass-200 text-right font-semibold">
                          {formatMoney(adjustValuationRecord(r))}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => {
                              if (confirm('确定删除这条估值记录吗？')) deleteValuation(r.id);
                            }}
                            className="p-1 rounded text-ink-500 hover:text-wine-400 hover:bg-wine-500/10 transition-all"
                            title="删除"
                            data-testid={`delete-valuation-${r.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-ink-500">暂无估值记录，点击「记估值」添加第一条。</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
