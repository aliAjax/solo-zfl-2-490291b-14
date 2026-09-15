import type { KeyboardLog, ValuationRecord, InsurancePolicy, ClaimRecord } from '@/types';
import {
  SWITCH_TYPES,
  SOUND_CHARACTERS,
  KEYCAP_MATERIALS,
  KEYCAP_PROFILES,
  PLATE_MATERIALS,
  CASE_MATERIALS,
} from '@/types';
import {
  dedupeValuations,
  validateValuationRecord,
  validatePolicyRecord,
  validateClaimRecord,
} from '@/utils/ledger';

export const EXPORT_FORMAT_VERSION = 2;
export const EXPORT_FORMAT_MAGIC = 'keyfeeling-export';

export type DuplicateStrategy = 'skip' | 'overwrite' | 'regenerate';

/** 估值与保险台账导出数据 */
export interface LedgerExport {
  valuations: ValuationRecord[];
  policies: InsurancePolicy[];
  claims: ClaimRecord[];
}

export interface ExportEnvelope {
  format: string;
  version: number;
  exportedAt: string;
  recordCount: number;
  data: KeyboardLog[];
  ledger?: LedgerExport;
}

export interface ImportParseResult {
  fileValidLogs: KeyboardLog[];
  fileInvalidItems: Array<{ index: number; reason: string; raw: unknown }>;
  fileInternalDuplicates: Array<{ index: number; id: string; raw: unknown }>;
  totalParsed: number;
  envelope?: ExportEnvelope;
  /** 文件中的台账数据（已校验、估值已按同日同来源去重） */
  ledger?: LedgerExport;
  /** 台账中被跳过的无效条目数 */
  ledgerInvalid: number;
}

export interface ImportApplyResult {
  toAdd: KeyboardLog[];
  toOverwrite: KeyboardLog[];
  toRegenerate: KeyboardLog[];
  skipped: KeyboardLog[];
  finalLogs: KeyboardLog[];
  stats: {
    added: number;
    overwritten: number;
    regenerated: number;
    skipped: number;
  };
}

export interface ValidatedLog {
  log: KeyboardLog;
  isDuplicateExisting: boolean;
}

const REQUIRED_STRING_FIELDS: (keyof KeyboardLog)[] = [
  'id',
  'name',
  'brand',
  'model',
  'purchaseDate',
  'switchName',
  'switchType',
  'switchLubed',
  'keycapMaterial',
  'keycapProfile',
  'keycapProcess',
  'plateMaterial',
  'plateThickness',
  'fillMaterial',
  'caseMaterial',
  'soundCharacter',
  'notes',
  'createdAt',
  'updatedAt',
];

const REQUIRED_NUMBER_FIELDS: (keyof KeyboardLog)[] = [
  'overallRating',
  'reboundRating',
  'tactilityRating',
  'fatigueRating',
];

function isValidSwitchType(v: unknown): v is KeyboardLog['switchType'] {
  return typeof v === 'string' && SWITCH_TYPES.includes(v as never);
}

function isValidSoundCharacter(v: unknown): v is KeyboardLog['soundCharacter'] {
  return typeof v === 'string' && SOUND_CHARACTERS.includes(v as never);
}

function isValidKeycapMaterial(v: unknown): v is KeyboardLog['keycapMaterial'] {
  return typeof v === 'string' && KEYCAP_MATERIALS.includes(v as never);
}

function isValidKeycapProfile(v: unknown): v is KeyboardLog['keycapProfile'] {
  return typeof v === 'string' && KEYCAP_PROFILES.includes(v as never);
}

function isValidPlateMaterial(v: unknown): v is KeyboardLog['plateMaterial'] {
  return typeof v === 'string' && PLATE_MATERIALS.includes(v as never);
}

function isValidCaseMaterial(v: unknown): v is KeyboardLog['caseMaterial'] {
  return typeof v === 'string' && CASE_MATERIALS.includes(v as never);
}

export function genNewId(): string {
  return 'log-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '-' + Math.random().toString(36).slice(2, 6);
}

function validateLog(raw: unknown): { valid: boolean; reason?: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { valid: false, reason: '不是有效的对象' };
  }

  const obj = raw as Record<string, unknown>;

  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof obj[field] !== 'string') {
      return { valid: false, reason: `缺少或无效的字段: ${String(field)}` };
    }
  }

  for (const field of REQUIRED_NUMBER_FIELDS) {
    if (typeof obj[field] !== 'number' || isNaN(obj[field] as number)) {
      return { valid: false, reason: `缺少或无效的字段: ${String(field)}` };
    }
  }

  if (!Array.isArray(obj.soundTags) || !obj.soundTags.every((t) => typeof t === 'string')) {
    return { valid: false, reason: 'soundTags 必须是字符串数组' };
  }

  if (!isValidSwitchType(obj.switchType)) {
    return { valid: false, reason: `无效的轴体类型: ${String(obj.switchType)}` };
  }
  if (!isValidSoundCharacter(obj.soundCharacter)) {
    return { valid: false, reason: `无效的声音倾向: ${String(obj.soundCharacter)}` };
  }
  if (!isValidKeycapMaterial(obj.keycapMaterial)) {
    return { valid: false, reason: `无效的键帽材质: ${String(obj.keycapMaterial)}` };
  }
  if (!isValidKeycapProfile(obj.keycapProfile)) {
    return { valid: false, reason: `无效的键帽高度: ${String(obj.keycapProfile)}` };
  }
  if (!isValidPlateMaterial(obj.plateMaterial)) {
    return { valid: false, reason: `无效的定位板材质: ${String(obj.plateMaterial)}` };
  }
  if (!isValidCaseMaterial(obj.caseMaterial)) {
    return { valid: false, reason: `无效的外壳材质: ${String(obj.caseMaterial)}` };
  }

  return { valid: true };
}

export function extractLogsFromJson(rawJson: string): KeyboardLog[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return [];
  }

  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is KeyboardLog => validateLog(item).valid);
  }

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'format' in parsed &&
    (parsed as { format?: unknown }).format === EXPORT_FORMAT_MAGIC &&
    'data' in parsed &&
    Array.isArray((parsed as { data: unknown }).data)
  ) {
    return (parsed as { data: unknown[] }).data.filter((item): item is KeyboardLog => validateLog(item).valid);
  }

  return [];
}

export function parseImportData(rawJson: string, existingIds: string[]): ImportParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    throw new Error('JSON 解析失败：' + (e instanceof Error ? e.message : String(e)));
  }

  let envelope: ExportEnvelope | undefined;
  let rawArray: unknown[];
  let rawLedger: unknown;

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    'format' in parsed &&
    (parsed as { format?: unknown }).format === EXPORT_FORMAT_MAGIC &&
    'data' in parsed &&
    Array.isArray((parsed as { data: unknown }).data)
  ) {
    envelope = parsed as ExportEnvelope;
    rawArray = envelope.data;
    rawLedger = (parsed as { ledger?: unknown }).ledger;
  } else if (Array.isArray(parsed)) {
    rawArray = parsed;
  } else {
    throw new Error('JSON 根节点必须是数组或有效的 KeyFeeling 导出格式');
  }

  const fileValidLogs: KeyboardLog[] = [];
  const fileInvalidItems: Array<{ index: number; reason: string; raw: unknown }> = [];
  const fileInternalDuplicates: Array<{ index: number; id: string; raw: unknown }> = [];
  const seenIds = new Set<string>();

  rawArray.forEach((item, index) => {
    const result = validateLog(item);
    if (!result.valid) {
      fileInvalidItems.push({ index, reason: result.reason || '未知错误', raw: item });
      return;
    }

    const log = item as KeyboardLog;

    if (seenIds.has(log.id)) {
      fileInternalDuplicates.push({ index, id: log.id, raw: item });
      return;
    }
    seenIds.add(log.id);

    fileValidLogs.push(log);
  });

  void existingIds;

  const { ledger, ledgerInvalid } = parseLedger(rawLedger);

  return {
    fileValidLogs,
    fileInvalidItems,
    fileInternalDuplicates,
    totalParsed: rawArray.length,
    envelope,
    ledger,
    ledgerInvalid,
  };
}

/** 解析并校验台账数据：无效条目跳过，估值按“同日同来源”规则去重 */
function parseLedger(raw: unknown): { ledger?: LedgerExport; ledgerInvalid: number } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ledger: undefined, ledgerInvalid: 0 };
  }
  const obj = raw as Record<string, unknown>;
  let invalid = 0;

  const valuations: ValuationRecord[] = [];
  if (Array.isArray(obj.valuations)) {
    for (const item of obj.valuations) {
      if (validateValuationRecord(item).valid) valuations.push(item as ValuationRecord);
      else invalid++;
    }
  }

  const policies: InsurancePolicy[] = [];
  if (Array.isArray(obj.policies)) {
    for (const item of obj.policies) {
      if (validatePolicyRecord(item).valid) policies.push(item as InsurancePolicy);
      else invalid++;
    }
  }

  const claims: ClaimRecord[] = [];
  if (Array.isArray(obj.claims)) {
    for (const item of obj.claims) {
      if (validateClaimRecord(item).valid) claims.push(item as ClaimRecord);
      else invalid++;
    }
  }

  if (valuations.length === 0 && policies.length === 0 && claims.length === 0) {
    return { ledger: undefined, ledgerInvalid: invalid };
  }

  return {
    ledger: {
      valuations: dedupeValuations(valuations),
      policies,
      claims,
    },
    ledgerInvalid: invalid,
  };
}

export function buildValidatedLogs(
  fileValidLogs: KeyboardLog[],
  existingLogs: KeyboardLog[],
): {
  newLogs: ValidatedLog[];
  duplicateWithExisting: ValidatedLog[];
} {
  const existingIdSet = new Set(existingLogs.map((l) => l.id));
  const newLogs: ValidatedLog[] = [];
  const duplicateWithExisting: ValidatedLog[] = [];

  for (const log of fileValidLogs) {
    const entry: ValidatedLog = {
      log,
      isDuplicateExisting: existingIdSet.has(log.id),
    };
    if (entry.isDuplicateExisting) {
      duplicateWithExisting.push(entry);
    } else {
      newLogs.push(entry);
    }
  }

  return { newLogs, duplicateWithExisting };
}

export function applyImport(
  existingLogs: KeyboardLog[],
  selectedForImport: string[],
  fileValidLogs: KeyboardLog[],
  duplicateWithExisting: ValidatedLog[],
  strategy: DuplicateStrategy,
): ImportApplyResult {
  const selectedSet = new Set(selectedForImport);

  const selectedNew = fileValidLogs
    .filter((log) => {
      if (!selectedSet.has(log.id)) return false;
      const dup = duplicateWithExisting.find((d) => d.log.id === log.id);
      return !dup;
    });

  const selectedDup = duplicateWithExisting
    .filter((d) => selectedSet.has(d.log.id));

  const toAdd: KeyboardLog[] = [];
  const toOverwrite: KeyboardLog[] = [];
  const toRegenerate: KeyboardLog[] = [];
  const skipped: KeyboardLog[] = [];

  for (const log of selectedNew) {
    toAdd.push(log);
  }

  for (const dup of selectedDup) {
    switch (strategy) {
      case 'skip':
        skipped.push(dup.log);
        break;
      case 'overwrite':
        toOverwrite.push({
          ...dup.log,
          updatedAt: new Date().toISOString(),
        });
        break;
      case 'regenerate': {
        let newId = genNewId();
        const allIds = new Set([
          ...existingLogs.map((l) => l.id),
          ...toAdd.map((l) => l.id),
          ...toRegenerate.map((l) => l.id),
        ]);
        while (allIds.has(newId)) {
          newId = genNewId();
        }
        toRegenerate.push({
          ...dup.log,
          id: newId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        break;
      }
    }
  }

  let finalLogs = [...existingLogs];

  for (const ow of toOverwrite) {
    const idx = finalLogs.findIndex((l) => l.id === ow.id);
    if (idx >= 0) {
      finalLogs[idx] = ow;
    } else {
      finalLogs.unshift(ow);
    }
  }

  finalLogs = [...toAdd, ...toRegenerate, ...finalLogs];

  return {
    toAdd,
    toOverwrite,
    toRegenerate,
    skipped,
    finalLogs,
    stats: {
      added: toAdd.length,
      overwritten: toOverwrite.length,
      regenerated: toRegenerate.length,
      skipped: skipped.length,
    },
  };
}

export function buildExportEnvelope(logs: KeyboardLog[], ledger?: LedgerExport): ExportEnvelope {
  return {
    format: EXPORT_FORMAT_MAGIC,
    version: ledger ? EXPORT_FORMAT_VERSION : 1,
    exportedAt: new Date().toISOString(),
    recordCount: logs.length,
    data: logs,
    ...(ledger ? { ledger } : {}),
  };
}

export function exportToJson(logs: KeyboardLog[], ledger?: LedgerExport): string {
  return JSON.stringify(buildExportEnvelope(logs, ledger), null, 2);
}

export function downloadJsonFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateExportFilename(): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `keyfeeling-export-${dateStr}.json`;
}
