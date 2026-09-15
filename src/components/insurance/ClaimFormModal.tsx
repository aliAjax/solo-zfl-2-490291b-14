import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Siren, CheckCircle2, XCircle } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { getClaimableAmount, type ValuationEstimate } from '@/utils/ledger';
import { formatMoney } from '@/utils/helpers';

interface Props {
  policyId: string;
  defaultKeyboardId?: string;
  estimates: Map<string, ValuationEstimate>;
  onClose: () => void;
}

export default function ClaimFormModal({ policyId, defaultKeyboardId, estimates, onClose }: Props) {
  const { policies, claims, logs, fileClaim } = useAppStore();
  const policy = policies.find((p) => p.id === policyId);
  const keyboardName = new Map(logs.map((l) => [l.id, l.name]));

  const [keyboardId, setKeyboardId] = useState(
    defaultKeyboardId ?? policy?.coveredKeyboardIds[0] ?? '',
  );
  const [incidentId, setIncidentId] = useState('');
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ ok: boolean; reason?: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const claimable = useMemo(() => {
    if (!policy || !keyboardId) return null;
    return getClaimableAmount(policy, estimates, claims, keyboardId);
  }, [policy, keyboardId, estimates, claims]);

  if (!policy) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = fileClaim(policy.id, {
      keyboardId,
      incidentId,
      incidentDate,
      amount: Math.round(Number(amount)),
      note: note.trim(),
    });
    setResult(res);
  };

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-surface !max-w-lg scrollbar-thin">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-ink-700/60 bg-gradient-to-b from-ink-800/98 to-ink-800/90 backdrop-blur-sm">
          <div>
            <h2 className="font-mono text-lg font-bold text-gradient-brass">发起报案</h2>
            <p className="text-xs text-ink-500 mt-0.5">
              {policy.name} · 免赔额 {formatMoney(policy.deductible)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-ink-500 hover:text-ink-200 hover:bg-ink-700/60 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          <div className="p-6">
            <div
              className={`rounded-xl border p-5 text-center animate-fadeIn ${
                result.ok
                  ? 'bg-moss-500/10 border-moss-500/30'
                  : 'bg-wine-500/10 border-wine-500/30'
              }`}
              data-testid="claim-result"
            >
              <div
                className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-3 ${
                  result.ok ? 'bg-moss-500/20 text-moss-400' : 'bg-wine-500/20 text-wine-400'
                }`}
              >
                {result.ok ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
              </div>
              <h3
                className={`font-mono text-sm font-semibold mb-1 ${
                  result.ok ? 'text-moss-300' : 'text-wine-400'
                }`}
              >
                {result.ok ? '报案成功，已赔付' : '报案被拒'}
              </h3>
              {!result.ok && result.reason && (
                <p className="text-xs text-ink-400" data-testid="claim-reject-reason">{result.reason}</p>
              )}
              {result.ok && (
                <p className="text-xs text-ink-400">
                  赔付 {formatMoney(Math.round(Number(amount)))}，记录已写入理赔台账
                </p>
              )}
            </div>
            <div className="flex justify-center gap-2 mt-4">
              {!result.ok && (
                <button onClick={() => setResult(null)} className="btn-secondary text-sm" data-testid="claim-retry">
                  修改后重报
                </button>
              )}
              <button onClick={onClose} className="btn-primary text-sm" data-testid="claim-close">
                关闭
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink-300 mb-1.5">出险键盘</label>
              <select
                value={keyboardId}
                onChange={(e) => setKeyboardId(e.target.value)}
                className="input-field appearance-none cursor-pointer"
                data-testid="claim-keyboard-select"
              >
                {policy.coveredKeyboardIds.map((id) => (
                  <option key={id} value={id}>
                    {keyboardName.get(id) ?? id}
                  </option>
                ))}
              </select>
            </div>

            {claimable && (
              <div className="grid grid-cols-3 gap-2" data-testid="claim-claimable">
                <div className="rounded-lg bg-ink-900/60 border border-ink-700/60 p-2.5 text-center">
                  <div className="font-mono text-sm font-bold text-ink-100">{formatMoney(claimable.allocated)}</div>
                  <div className="text-[9px] font-mono uppercase text-ink-500 mt-0.5">分摊保额</div>
                </div>
                <div className="rounded-lg bg-ink-900/60 border border-ink-700/60 p-2.5 text-center">
                  <div className="font-mono text-sm font-bold text-ink-100">{formatMoney(claimable.remaining)}</div>
                  <div className="text-[9px] font-mono uppercase text-ink-500 mt-0.5">剩余保额</div>
                </div>
                <div className="rounded-lg bg-brass-300/8 border border-brass-300/25 p-2.5 text-center">
                  <div className="font-mono text-sm font-bold text-brass-200" data-testid="claim-max-payable">
                    {formatMoney(claimable.maxPayable)}
                  </div>
                  <div className="text-[9px] font-mono uppercase text-ink-500 mt-0.5">可报上限</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1.5">事故编号</label>
                <input
                  type="text"
                  value={incidentId}
                  onChange={(e) => setIncidentId(e.target.value)}
                  placeholder="如 INC-2026-002"
                  className="input-field font-mono"
                  data-testid="claim-incident-input"
                />
                <p className="text-[10px] text-ink-500 mt-1">同一事故编号在所有保单内只能赔付一次</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1.5">事故日期</label>
                <input
                  type="date"
                  value={incidentDate}
                  onChange={(e) => setIncidentDate(e.target.value)}
                  className="input-field"
                  data-testid="claim-date-input"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1.5">报案金额（元）</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={claimable ? `最多 ${claimable.maxPayable}` : ''}
                  className="input-field font-mono"
                  data-testid="claim-amount-input"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1.5">备注</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="损失情况说明"
                  className="input-field"
                  data-testid="claim-note-input"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={onClose} className="btn-ghost">
                取消
              </button>
              <button type="submit" className="btn-primary min-w-[110px]" data-testid="claim-submit">
                <Siren className="h-4 w-4" />
                提交报案
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
