import { create } from 'zustand';
import type {
  KeyboardLog,
  FilterState,
  UIState,
  ViewMode,
  ValuationRecord,
  InsurancePolicy,
  ClaimRecord,
} from '@/types';
import {
  sampleData,
  sampleValuations,
  samplePolicies,
  sampleClaims,
} from '@/data/sampleData';
import type { ImportApplyResult, ValidatedLog, LedgerExport } from '@/utils/importExport';
import { applyImport, genNewId } from '@/utils/importExport';
import {
  dedupeValuations,
  estimateKeyboardValue,
  validateClaim,
  type ClaimInput,
} from '@/utils/ledger';

const STORAGE_KEY = 'keyfeeling-logs-v1';
const VALUATIONS_KEY = 'keyfeeling-valuations-v1';
const POLICIES_KEY = 'keyfeeling-policies-v1';
const CLAIMS_KEY = 'keyfeeling-claims-v1';

function loadFromStorage(): KeyboardLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleData));
      return sampleData;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return sampleData;
  } catch {
    return sampleData;
  }
}

function loadCollection<T>(key: string, seed: T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return seed;
  } catch {
    return seed;
  }
}

function saveToStorage(logs: KeyboardLog[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // ignore
  }
}

function saveCollection<T>(key: string, items: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // ignore
  }
}

function genId() {
  return genNewId();
}

export interface LedgerImportResult {
  valuationsAdded: number;
  policiesAdded: number;
  claimsAdded: number;
}

interface AppState {
  logs: KeyboardLog[];
  valuations: ValuationRecord[];
  policies: InsurancePolicy[];
  claims: ClaimRecord[];
  filter: FilterState;
  ui: UIState;
  setFilter: (patch: Partial<FilterState>) => void;
  resetFilter: () => void;
  createLog: (data: Omit<KeyboardLog, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateLog: (id: string, data: Partial<KeyboardLog>) => void;
  deleteLog: (id: string) => void;
  importLogs: (
    selectedForImport: string[],
    fileValidLogs: KeyboardLog[],
    duplicateWithExisting: ValidatedLog[],
    strategy: 'skip' | 'overwrite' | 'regenerate',
  ) => ImportApplyResult;
  importLedger: (ledger: LedgerExport) => LedgerImportResult;
  addValuation: (data: Omit<ValuationRecord, 'id' | 'createdAt' | 'updatedAt'>) => void;
  deleteValuation: (id: string) => void;
  createPolicy: (data: Omit<InsurancePolicy, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updatePolicy: (id: string, data: Partial<InsurancePolicy>) => void;
  deletePolicy: (id: string) => void;
  renewPolicy: (
    id: string,
    patch: { startDate: string; endDate: string; coverageLimit: number; deductible: number },
  ) => void;
  fileClaim: (policyId: string, input: ClaimInput) => { ok: boolean; reason?: string };
  deleteClaim: (id: string) => void;
  refreshFromStorage: () => void;
  setViewMode: (mode: ViewMode) => void;
  toggleCompareSelect: (id: string) => void;
  clearCompareSelect: () => void;
  openFormModal: (log?: KeyboardLog | null) => void;
  closeFormModal: () => void;
  openDetail: (log: KeyboardLog) => void;
  closeDetail: () => void;
  openImportExport: () => void;
  closeImportExport: () => void;
}

const defaultFilter: FilterState = {
  switchType: 'all',
  soundCharacter: 'all',
  minRating: 0,
  searchKeyword: '',
};

const defaultUI: UIState = {
  viewMode: 'list',
  selectedForCompare: [],
  formModalOpen: false,
  editingLog: null,
  detailLog: null,
  importExportModalOpen: false,
};

export const useAppStore = create<AppState>((set, get) => ({
  logs: loadFromStorage(),
  valuations: loadCollection<ValuationRecord>(VALUATIONS_KEY, sampleValuations),
  policies: loadCollection<InsurancePolicy>(POLICIES_KEY, samplePolicies),
  claims: loadCollection<ClaimRecord>(CLAIMS_KEY, sampleClaims),
  filter: defaultFilter,
  ui: defaultUI,

  setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
  resetFilter: () => set({ filter: defaultFilter }),

  createLog: (data) => {
    const now = new Date().toISOString();
    const newLog: KeyboardLog = {
      ...data,
      id: genId(),
      createdAt: now,
      updatedAt: now,
    };
    const next = [newLog, ...get().logs];
    set({ logs: next, ui: { ...get().ui, formModalOpen: false, editingLog: null } });
    saveToStorage(next);
  },

  updateLog: (id, data) => {
    const next = get().logs.map((l) =>
      l.id === id ? { ...l, ...data, updatedAt: new Date().toISOString() } : l,
    );
    set({ logs: next, ui: { ...get().ui, formModalOpen: false, editingLog: null } });
    saveToStorage(next);
  },

  deleteLog: (id) => {
    const next = get().logs.filter((l) => l.id !== id);
    const selected = get().ui.selectedForCompare.filter((sid) => sid !== id);
    set({ logs: next, ui: { ...get().ui, selectedForCompare: selected, detailLog: null } });
    saveToStorage(next);

    // 级联清理台账：估值、保单覆盖、理赔记录
    const valuations = get().valuations.filter((v) => v.keyboardId !== id);
    const policies = get().policies.map((p) =>
      p.coveredKeyboardIds.includes(id)
        ? { ...p, coveredKeyboardIds: p.coveredKeyboardIds.filter((k) => k !== id) }
        : p,
    );
    const claims = get().claims.filter((c) => c.keyboardId !== id);
    set({ valuations, policies, claims });
    saveCollection(VALUATIONS_KEY, valuations);
    saveCollection(POLICIES_KEY, policies);
    saveCollection(CLAIMS_KEY, claims);
  },

  importLogs: (selectedForImport, fileValidLogs, duplicateWithExisting, strategy) => {
    const result = applyImport(
      get().logs,
      selectedForImport,
      fileValidLogs,
      duplicateWithExisting,
      strategy,
    );
    set({ logs: result.finalLogs });
    saveToStorage(result.finalLogs);
    return result;
  },

  importLedger: (ledger) => {
    const state = get();

    const existingValIds = new Set(state.valuations.map((v) => v.id));
    const newVals = ledger.valuations.filter((v) => !existingValIds.has(v.id));
    // 合并后按“同一天同一来源只留最新”规则去重
    const valuations = dedupeValuations([...state.valuations, ...newVals]);

    const existingPolIds = new Set(state.policies.map((p) => p.id));
    const newPols = ledger.policies.filter((p) => !existingPolIds.has(p.id));
    const policies = [...newPols, ...state.policies];

    const existingClaimIds = new Set(state.claims.map((c) => c.id));
    const usedIncidents = new Set(
      state.claims
        .filter((c) => c.status !== 'rejected')
        .map((c) => c.incidentId.trim()),
    );
    const newClaims: ClaimRecord[] = [];
    for (const c of ledger.claims) {
      if (existingClaimIds.has(c.id)) continue;
      // 同一事故编号在所有保单范围内只能有一条有效赔付
      if (c.status !== 'rejected') {
        const key = c.incidentId.trim();
        if (usedIncidents.has(key)) continue;
        usedIncidents.add(key);
      }
      newClaims.push(c);
    }
    const claims = [...newClaims, ...state.claims];

    set({ valuations, policies, claims });
    saveCollection(VALUATIONS_KEY, valuations);
    saveCollection(POLICIES_KEY, policies);
    saveCollection(CLAIMS_KEY, claims);

    return {
      valuationsAdded: newVals.length,
      policiesAdded: newPols.length,
      claimsAdded: newClaims.length,
    };
  },

  addValuation: (data) => {
    const now = new Date().toISOString();
    const rec: ValuationRecord = { ...data, id: genId(), createdAt: now, updatedAt: now };
    // 同一天同一来源只留最新记录
    const rest = get().valuations.filter(
      (v) => !(v.keyboardId === rec.keyboardId && v.source === rec.source && v.date === rec.date),
    );
    const next = dedupeValuations([rec, ...rest]);
    set({ valuations: next });
    saveCollection(VALUATIONS_KEY, next);
  },

  deleteValuation: (id) => {
    const next = get().valuations.filter((v) => v.id !== id);
    set({ valuations: next });
    saveCollection(VALUATIONS_KEY, next);
  },

  createPolicy: (data) => {
    const now = new Date().toISOString();
    const policy: InsurancePolicy = { ...data, id: genId(), createdAt: now, updatedAt: now };
    const next = [policy, ...get().policies];
    set({ policies: next });
    saveCollection(POLICIES_KEY, next);
  },

  updatePolicy: (id, data) => {
    const next = get().policies.map((p) =>
      p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p,
    );
    set({ policies: next });
    saveCollection(POLICIES_KEY, next);
  },

  deletePolicy: (id) => {
    const policies = get().policies.filter((p) => p.id !== id);
    const claims = get().claims.filter((c) => c.policyId !== id);
    set({ policies, claims });
    saveCollection(POLICIES_KEY, policies);
    saveCollection(CLAIMS_KEY, claims);
  },

  renewPolicy: (id, patch) => {
    const old = get().policies.find((p) => p.id === id);
    if (!old) return;
    const now = new Date().toISOString();
    // 续保生成新保单并保留旧覆盖记录
    const renewed: InsurancePolicy = {
      ...old,
      ...patch,
      id: genId(),
      renewedFromId: old.id,
      createdAt: now,
      updatedAt: now,
    };
    // 旧保单保障期接续到新单生效前一日，避免保障重叠或空窗
    const dayBefore = new Date(new Date(patch.startDate).getTime() - 86400000)
      .toISOString()
      .slice(0, 10);
    const next = get().policies.map((p) =>
      p.id === id && p.endDate > dayBefore ? { ...p, endDate: dayBefore, updatedAt: now } : p,
    );
    const all = [renewed, ...next];
    set({ policies: all });
    saveCollection(POLICIES_KEY, all);
  },

  fileClaim: (policyId, input) => {
    const state = get();
    const policy = state.policies.find((p) => p.id === policyId);
    if (!policy) return { ok: false, reason: '保单不存在' };

    const estimates = new Map(
      state.logs.map((l) => [
        l.id,
        estimateKeyboardValue(state.valuations.filter((v) => v.keyboardId === l.id)),
      ]),
    );
    const result = validateClaim(policy, estimates, state.claims, input);

    const claim: ClaimRecord = {
      id: genId(),
      policyId,
      keyboardId: input.keyboardId,
      incidentId: input.incidentId.trim(),
      incidentDate: input.incidentDate,
      amount: input.amount,
      status: result.ok ? 'paid' : 'rejected',
      reason: result.ok ? '' : result.reason ?? '',
      note: input.note,
      createdAt: new Date().toISOString(),
    };
    const next = [claim, ...state.claims];
    set({ claims: next });
    saveCollection(CLAIMS_KEY, next);
    return result;
  },

  deleteClaim: (id) => {
    const next = get().claims.filter((c) => c.id !== id);
    set({ claims: next });
    saveCollection(CLAIMS_KEY, next);
  },

  refreshFromStorage: () => {
    set({
      logs: loadFromStorage(),
      valuations: loadCollection<ValuationRecord>(VALUATIONS_KEY, sampleValuations),
      policies: loadCollection<InsurancePolicy>(POLICIES_KEY, samplePolicies),
      claims: loadCollection<ClaimRecord>(CLAIMS_KEY, sampleClaims),
    });
  },

  setViewMode: (mode) => set({ ui: { ...get().ui, viewMode: mode } }),

  toggleCompareSelect: (id) => {
    const cur = get().ui.selectedForCompare;
    let next: string[];
    if (cur.includes(id)) {
      next = cur.filter((x) => x !== id);
    } else if (cur.length >= 2) {
      next = [cur[1], id];
    } else {
      next = [...cur, id];
    }
    set({ ui: { ...get().ui, selectedForCompare: next } });
  },

  clearCompareSelect: () =>
    set({ ui: { ...get().ui, selectedForCompare: [], viewMode: 'list' } }),

  openFormModal: (log) =>
    set({ ui: { ...get().ui, formModalOpen: true, editingLog: log ?? null } }),
  closeFormModal: () => set({ ui: { ...get().ui, formModalOpen: false, editingLog: null } }),

  openDetail: (log) => set({ ui: { ...get().ui, detailLog: log } }),
  closeDetail: () => set({ ui: { ...get().ui, detailLog: null } }),

  openImportExport: () => set({ ui: { ...get().ui, importExportModalOpen: true } }),
  closeImportExport: () => set({ ui: { ...get().ui, importExportModalOpen: false } }),
}));

export function useFilteredLogs(): KeyboardLog[] {
  const { logs, filter } = useAppStore();
  const { switchType, soundCharacter, minRating, searchKeyword } = filter;
  const kw = searchKeyword.trim().toLowerCase();
  return logs.filter((log) => {
    if (switchType !== 'all' && log.switchType !== switchType) return false;
    if (soundCharacter !== 'all' && log.soundCharacter !== soundCharacter) return false;
    if (log.overallRating < minRating) return false;
    if (kw) {
      const haystack = [
        log.name,
        log.brand,
        log.model,
        log.switchName,
        log.notes,
        log.keycapProcess,
        ...log.soundTags,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(kw)) return false;
    }
    return true;
  });
}
