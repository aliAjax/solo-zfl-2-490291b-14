import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Copy } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import {
  VALUATION_SOURCES,
  VALUATION_SOURCE_LABELS,
  CONDITION_GRADES,
  CONDITION_LABELS,
  BOX_PAPERS_OPTIONS,
  BOX_PAPERS_LABELS,
  type ValuationSource,
  type ConditionGrade,
  type BoxPapers,
} from '@/types';
import { SOURCE_WEIGHTS, CONDITION_FACTORS, BOX_PAPERS_FACTORS } from '@/utils/ledger';
import { formatMoney } from '@/utils/helpers';

interface Props {
  defaultKeyboardId?: string;
  onClose: () => void;
}

export default function ValuationFormModal({ defaultKeyboardId, onClose }: Props) {
  const { logs, valuations, addValuation } = useAppStore();

  const [keyboardId, setKeyboardId] = useState(defaultKeyboardId ?? logs[0]?.id ?? '');
  const [source, setSource] = useState<ValuationSource>('market');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [condition, setCondition] = useState<ConditionGrade>('excellent');
  const [boxPapers, setBoxPapers] = useState<BoxPapers>('full');
  const [modAdjustment, setModAdjustment] = useState('0');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** 同一天同一来源已有记录时提示将被覆盖 */
  const duplicate = useMemo(
    () =>
      valuations.find(
        (v) => v.keyboardId === keyboardId && v.source === source && v.date === date,
      ),
    [valuations, keyboardId, source, date],
  );

  const parsedAmount = Number(amount);
  const parsedMod = Number(modAdjustment || '0');
  const preview =
    amount !== '' && !isNaN(parsedAmount) && !isNaN(parsedMod)
      ? Math.max(0, parsedAmount + parsedMod) * CONDITION_FACTORS[condition] * BOX_PAPERS_FACTORS[boxPapers]
      : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyboardId) {
      setError('请选择键盘');
      return;
    }
    if (!(parsedAmount > 0)) {
      setError('请输入有效的报价金额');
      return;
    }
    if (isNaN(parsedMod)) {
      setError('改装调整必须是数字');
      return;
    }
    if (!date) {
      setError('请选择估值日期');
      return;
    }
    addValuation({
      keyboardId,
      source,
      date,
      amount: Math.round(parsedAmount),
      condition,
      boxPapers,
      modAdjustment: Math.round(parsedMod),
      note: note.trim(),
    });
    onClose();
  };

  const selectClass = 'input-field appearance-none cursor-pointer';

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-surface !max-w-xl scrollbar-thin">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-ink-700/60 bg-gradient-to-b from-ink-800/98 to-ink-800/90 backdrop-blur-sm">
          <div>
            <h2 className="font-mono text-lg font-bold text-gradient-brass">记估值</h2>
            <p className="text-xs text-ink-500 mt-0.5">
              同一天同一来源只保留最新一条记录
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
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-ink-300 mb-1.5">键盘</label>
              <select
                value={keyboardId}
                onChange={(e) => setKeyboardId(e.target.value)}
                className={selectClass}
                data-testid="valuation-keyboard-select"
              >
                {logs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}（{l.brand} {l.model}）
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-300 mb-1.5">来源</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as ValuationSource)}
                className={selectClass}
                data-testid="valuation-source-select"
              >
                {VALUATION_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {VALUATION_SOURCE_LABELS[s]}（权重 {SOURCE_WEIGHTS[s]}）
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-300 mb-1.5">估值日期</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input-field"
                data-testid="valuation-date-input"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-300 mb-1.5">报价（元）</label>
              <input
                type="number"
                min="0"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="如 5200"
                className="input-field font-mono"
                data-testid="valuation-amount-input"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-300 mb-1.5">
                改装调整（元，可为负）
              </label>
              <input
                type="number"
                step="1"
                value={modAdjustment}
                onChange={(e) => setModAdjustment(e.target.value)}
                placeholder="如 +300 / -100"
                className="input-field font-mono"
                data-testid="valuation-mod-input"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-300 mb-1.5">成色</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as ConditionGrade)}
                className={selectClass}
                data-testid="valuation-condition-select"
              >
                {CONDITION_GRADES.map((c) => (
                  <option key={c} value={c}>
                    {CONDITION_LABELS[c]}（×{CONDITION_FACTORS[c]}）
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-300 mb-1.5">箱说</label>
              <select
                value={boxPapers}
                onChange={(e) => setBoxPapers(e.target.value as BoxPapers)}
                className={selectClass}
                data-testid="valuation-box-select"
              >
                {BOX_PAPERS_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {BOX_PAPERS_LABELS[b]}（×{BOX_PAPERS_FACTORS[b]}）
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-ink-300 mb-1.5">备注</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="成交链接、报价人、改装明细..."
                className="input-field"
                data-testid="valuation-note-input"
              />
            </div>
          </div>

          {duplicate && (
            <div className="rounded-lg bg-brass-300/8 border border-brass-300/25 px-3 py-2 text-[11px] text-brass-200 flex items-start gap-2" data-testid="valuation-duplicate-hint">
              <Copy className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                {date} 已有「{VALUATION_SOURCE_LABELS[source]}」记录（{formatMoney(duplicate.amount)}），保存后将覆盖该旧记录。
              </span>
            </div>
          )}

          {preview !== null && (
            <div className="rounded-lg bg-ink-900/60 border border-ink-700/60 px-3 py-2 text-[11px] font-mono text-ink-300" data-testid="valuation-preview">
              修正后价值 ≈ <span className="text-brass-200 font-bold">{formatMoney(preview)}</span>
              <span className="text-ink-500">
                （(报价 + 改装) × 成色 × 箱说 = ({parsedAmount} + {parsedMod}) × {CONDITION_FACTORS[condition]} × {BOX_PAPERS_FACTORS[boxPapers]}）
              </span>
            </div>
          )}

          {error && <p className="text-[11px] text-wine-400">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost">
              取消
            </button>
            <button type="submit" className="btn-primary min-w-[110px]" data-testid="valuation-submit">
              <Save className="h-4 w-4" />
              保存估值
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
