import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, RotateCcw } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { InsurancePolicy } from '@/types';
import { formatMoney } from '@/utils/helpers';
import type { ValuationEstimate } from '@/utils/ledger';

interface Props {
  mode: 'create' | 'edit' | 'renew';
  policy?: InsurancePolicy;
  estimates: Map<string, ValuationEstimate>;
  onClose: () => void;
}

export default function PolicyFormModal({ mode, policy, estimates, onClose }: Props) {
  const { logs, createPolicy, updatePolicy, renewPolicy } = useAppStore();

  const today = new Date().toISOString().slice(0, 10);
  const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);

  const [name, setName] = useState(policy?.name ?? '');
  const [insurer, setInsurer] = useState(policy?.insurer ?? '');
  const [policyNo, setPolicyNo] = useState(policy?.policyNo ?? '');
  const [coverageLimit, setCoverageLimit] = useState(String(policy?.coverageLimit ?? ''));
  const [deductible, setDeductible] = useState(String(policy?.deductible ?? '0'));
  const [startDate, setStartDate] = useState(mode === 'renew' ? today : (policy?.startDate ?? today));
  const [endDate, setEndDate] = useState(mode === 'renew' ? nextYear : (policy?.endDate ?? nextYear));
  const [covered, setCovered] = useState<string[]>(policy?.coveredKeyboardIds ?? []);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleCovered = (id: string) => {
    setCovered((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const limit = Number(coverageLimit);
    const ded = Number(deductible || '0');
    if (!name.trim()) return setError('请填写保单名称');
    if (!insurer.trim()) return setError('请填写承保方');
    if (!(limit > 0)) return setError('保单额度必须大于 0');
    if (!(ded >= 0)) return setError('免赔额不能为负');
    if (!startDate || !endDate) return setError('请选择起止日期');
    if (endDate <= startDate) return setError('终止日期必须晚于起始日期');
    if (covered.length === 0) return setError('请至少选择一把覆盖键盘');

    const payload = {
      name: name.trim(),
      insurer: insurer.trim(),
      policyNo: policyNo.trim(),
      coverageLimit: Math.round(limit),
      deductible: Math.round(ded),
      startDate,
      endDate,
      coveredKeyboardIds: covered,
    };

    if (mode === 'edit' && policy) {
      updatePolicy(policy.id, payload);
    } else if (mode === 'renew' && policy) {
      renewPolicy(policy.id, {
        startDate,
        endDate,
        coverageLimit: payload.coverageLimit,
        deductible: payload.deductible,
      });
    } else {
      createPolicy({ ...payload, renewedFromId: null });
    }
    onClose();
  };

  const title =
    mode === 'renew' ? '续保保单' : mode === 'edit' ? '编辑保单' : '新建保单';

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-surface !max-w-xl scrollbar-thin">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-ink-700/60 bg-gradient-to-b from-ink-800/98 to-ink-800/90 backdrop-blur-sm">
          <div>
            <h2 className="font-mono text-lg font-bold text-gradient-brass">{title}</h2>
            <p className="text-xs text-ink-500 mt-0.5">
              {mode === 'renew'
                ? `基于「${policy?.name}」生成新保单，旧覆盖记录将保留`
                : '一份保单可覆盖多把键盘，保额按估值占比分摊'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-ink-500 hover:text-ink-200 hover:bg-ink-700/60 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-300 mb-1.5">保单名称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="藏品综合险 2026"
                className="input-field"
                data-testid="policy-name-input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-300 mb-1.5">承保方</label>
              <input
                type="text"
                value={insurer}
                onChange={(e) => setInsurer(e.target.value)}
                placeholder="平安财险"
                className="input-field"
                data-testid="policy-insurer-input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-300 mb-1.5">保单号</label>
              <input
                type="text"
                value={policyNo}
                onChange={(e) => setPolicyNo(e.target.value)}
                placeholder="PA-2026-0081"
                className="input-field font-mono"
                data-testid="policy-no-input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-300 mb-1.5">保单额度（元）</label>
              <input
                type="number"
                min="0"
                step="1"
                value={coverageLimit}
                onChange={(e) => setCoverageLimit(e.target.value)}
                placeholder="如 5000"
                className="input-field font-mono"
                data-testid="policy-limit-input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-300 mb-1.5">免赔额（元）</label>
              <input
                type="number"
                min="0"
                step="1"
                value={deductible}
                onChange={(e) => setDeductible(e.target.value)}
                className="input-field font-mono"
                data-testid="policy-deductible-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1.5">起始日期</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input-field"
                  data-testid="policy-start-input"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1.5">终止日期</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input-field"
                  data-testid="policy-end-input"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-300 mb-2">
              覆盖键盘（{covered.length}）
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin pr-1">
              {logs.map((l) => {
                const est = estimates.get(l.id);
                const checked = covered.includes(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => toggleCovered(l.id)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-left transition-all ${
                      checked
                        ? 'bg-brass-300/12 border-brass-300/40 text-ink-100'
                        : 'bg-ink-900/40 border-ink-700/60 text-ink-400 hover:border-brass-300/25'
                    }`}
                    data-testid={`policy-cover-${l.id}`}
                  >
                    <span className="text-xs truncate">
                      <span className={checked ? 'text-brass-100' : ''}>{l.name}</span>
                      <span className="text-ink-500 ml-2 font-mono text-[10px]">
                        {l.brand} {l.model}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] shrink-0">
                      {est?.status === 'valued' ? (
                        formatMoney(est.mid)
                      ) : est?.status === 'pending' ? (
                        <span className="text-brass-200">待核</span>
                      ) : (
                        <span className="text-ink-600">无估值</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-ink-500 mt-1.5">
              待核 / 无估值的键盘不参与保额分摊，请先补充估值证据。
            </p>
          </div>

          {error && <p className="text-[11px] text-wine-400" data-testid="policy-error">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost">
              取消
            </button>
            <button type="submit" className="btn-primary min-w-[110px]" data-testid="policy-submit">
              {mode === 'renew' ? <RotateCcw className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {mode === 'renew' ? '确认续保' : '保存保单'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
