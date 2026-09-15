import { Trash2, CheckCircle2, XCircle, Landmark } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { formatMoney, formatDate } from '@/utils/helpers';

interface Props {
  keyboardName: Map<string, string>;
}

export default function ClaimPanel({ keyboardName }: Props) {
  const { claims, policies, deleteClaim } = useAppStore();

  const policyName = new Map(policies.map((p) => [p.id, p.name]));

  if (claims.length === 0) {
    return (
      <div className="card-surface flex flex-col items-center justify-center py-16 px-6 text-center">
        <Landmark className="h-8 w-8 text-ink-600 mb-3" />
        <h3 className="font-mono text-base font-semibold text-ink-200 mb-2">暂无理赔记录</h3>
        <p className="text-sm text-ink-500 max-w-sm">
          在「保单」页签中对覆盖的键盘发起报案，赔付与拒赔记录都会留在这里。
        </p>
      </div>
    );
  }

  const sorted = [...claims].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="card-surface p-4 sm:p-5 overflow-x-auto" data-testid="claim-list">
      <table className="w-full text-xs min-w-[720px]">
        <thead>
          <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-ink-500 border-b border-ink-700/60">
            <th className="py-2 pr-3 font-medium">报案时间</th>
            <th className="py-2 pr-3 font-medium">保单</th>
            <th className="py-2 pr-3 font-medium">键盘</th>
            <th className="py-2 pr-3 font-medium">事故编号</th>
            <th className="py-2 pr-3 font-medium">事故日期</th>
            <th className="py-2 pr-3 font-medium text-right">金额</th>
            <th className="py-2 pr-3 font-medium">结果</th>
            <th className="py-2 pr-3 font-medium">备注</th>
            <th className="py-2 font-medium text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.id} className="border-b border-ink-700/30 last:border-0" data-testid={`claim-row-${c.id}`}>
              <td className="py-2.5 pr-3 font-mono text-ink-400 whitespace-nowrap">{formatDate(c.createdAt)}</td>
              <td className="py-2.5 pr-3 text-ink-200 whitespace-nowrap">{policyName.get(c.policyId) ?? '（已删除保单）'}</td>
              <td className="py-2.5 pr-3 text-ink-200 whitespace-nowrap">{keyboardName.get(c.keyboardId) ?? '未知键盘'}</td>
              <td className="py-2.5 pr-3 font-mono text-ink-300 whitespace-nowrap">{c.incidentId}</td>
              <td className="py-2.5 pr-3 font-mono text-ink-300 whitespace-nowrap">{formatDate(c.incidentDate)}</td>
              <td className="py-2.5 pr-3 font-mono text-ink-100 text-right font-semibold">{formatMoney(c.amount)}</td>
              <td className="py-2.5 pr-3 whitespace-nowrap">
                {c.status === 'paid' ? (
                  <span className="inline-flex items-center gap-1 text-moss-400" data-testid={`claim-status-${c.id}`}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    已赔付
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-wine-400" title={c.reason} data-testid={`claim-status-${c.id}`}>
                    <XCircle className="h-3.5 w-3.5" />
                    拒赔
                  </span>
                )}
                {c.status === 'rejected' && c.reason && (
                  <div className="text-[10px] text-ink-500 mt-0.5 max-w-[220px]">{c.reason}</div>
                )}
              </td>
              <td className="py-2.5 pr-3 text-ink-400 max-w-[180px] truncate" title={c.note}>{c.note || '—'}</td>
              <td className="py-2.5 text-right">
                <button
                  onClick={() => {
                    if (confirm('确定删除这条理赔记录吗？')) deleteClaim(c.id);
                  }}
                  className="p-1 rounded text-ink-500 hover:text-wine-400 hover:bg-wine-500/10 transition-all"
                  title="删除"
                  data-testid={`delete-claim-${c.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
