export type SwitchType = 'linear' | 'tactile' | 'clicky' | 'other';
export type SoundCharacter = 'deep' | 'bright' | 'muffled' | 'neutral';
export type KeycapMaterial = 'ABS' | 'PBT' | 'PC' | '混合' | '其他';
export type KeycapProfile = 'Cherry' | 'SA' | 'DSA' | 'OEM' | 'XDA' | 'KAT' | 'MT3' | '其他';
export type PlateMaterial = '铝' | '铜' | '钢' | 'PC/FR4' | '碳纤维' | '塑料' | '其他';
export type CaseMaterial = '铝合金' | '塑料' | '木头' | '亚克力' | '黄铜' | '不锈钢' | '其他';

export interface KeyboardLog {
  id: string;
  name: string;
  brand: string;
  model: string;
  purchaseDate: string;
  overallRating: number;
  switchName: string;
  switchType: SwitchType;
  switchLubed: string;
  keycapMaterial: KeycapMaterial;
  keycapProfile: KeycapProfile;
  keycapProcess: string;
  plateMaterial: PlateMaterial;
  plateThickness: string;
  fillMaterial: string;
  caseMaterial: CaseMaterial;
  soundCharacter: SoundCharacter;
  soundTags: string[];
  reboundRating: number;
  tactilityRating: number;
  fatigueRating: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface FilterState {
  switchType: SwitchType | 'all';
  soundCharacter: SoundCharacter | 'all';
  minRating: number;
  searchKeyword: string;
}

export type ViewMode = 'list' | 'compare' | 'stats' | 'insurance';

// ===== 藏品估值 =====

export type ValuationSource = 'market' | 'auction' | 'dealer' | 'community' | 'self';
export type ConditionGrade = 'mint' | 'excellent' | 'good' | 'fair' | 'poor';
export type BoxPapers = 'full' | 'box_only' | 'none';

export interface ValuationRecord {
  id: string;
  keyboardId: string;
  source: ValuationSource;
  /** 估值日期 YYYY-MM-DD */
  date: string;
  /** 原始报价（未修正） */
  amount: number;
  condition: ConditionGrade;
  boxPapers: BoxPapers;
  /** 改装调整金额，可为负 */
  modAdjustment: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

// ===== 保险台账 =====

export interface InsurancePolicy {
  id: string;
  name: string;
  insurer: string;
  policyNo: string;
  /** 保单额度（分摊总额上限） */
  coverageLimit: number;
  /** 免赔额 */
  deductible: number;
  startDate: string;
  endDate: string;
  coveredKeyboardIds: string[];
  /** 续保来源保单 id，新保单为 null */
  renewedFromId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ClaimStatus = 'paid' | 'rejected';

export interface ClaimRecord {
  id: string;
  policyId: string;
  keyboardId: string;
  /** 事故编号：同一事故不能重复赔付 */
  incidentId: string;
  incidentDate: string;
  amount: number;
  status: ClaimStatus;
  /** 拒赔原因（status=rejected 时） */
  reason: string;
  note: string;
  createdAt: string;
}

export interface UIState {
  viewMode: ViewMode;
  selectedForCompare: string[];
  formModalOpen: boolean;
  editingLog: KeyboardLog | null;
  detailLog: KeyboardLog | null;
  importExportModalOpen: boolean;
}

export const SWITCH_TYPE_LABELS: Record<SwitchType, string> = {
  linear: '线性轴',
  tactile: '段落轴',
  clicky: '点击轴',
  other: '其他',
};

export const SOUND_CHARACTER_LABELS: Record<SoundCharacter, string> = {
  deep: '低沉',
  bright: '清脆',
  muffled: '闷响',
  neutral: '中性',
};

export const SWITCH_TYPES: SwitchType[] = ['linear', 'tactile', 'clicky', 'other'];
export const SOUND_CHARACTERS: SoundCharacter[] = ['deep', 'bright', 'muffled', 'neutral'];
export const KEYCAP_MATERIALS: KeycapMaterial[] = ['ABS', 'PBT', 'PC', '混合', '其他'];
export const KEYCAP_PROFILES: KeycapProfile[] = ['Cherry', 'SA', 'DSA', 'OEM', 'XDA', 'KAT', 'MT3', '其他'];
export const PLATE_MATERIALS: PlateMaterial[] = ['铝', '铜', '钢', 'PC/FR4', '碳纤维', '塑料', '其他'];
export const CASE_MATERIALS: CaseMaterial[] = ['铝合金', '塑料', '木头', '亚克力', '黄铜', '不锈钢', '其他'];

export const PRESET_SOUND_TAGS = [
  '沙脆', '麻将音', '雨滴声', '低频闷', '高频亮',
  '回响声', '塑料感', '金属感', '木头声', '软弹',
  '硬朗', '细腻', '厚重', '空灵', '干净',
];

export const VALUATION_SOURCES: ValuationSource[] = ['market', 'auction', 'dealer', 'community', 'self'];
export const CONDITION_GRADES: ConditionGrade[] = ['mint', 'excellent', 'good', 'fair', 'poor'];
export const BOX_PAPERS_OPTIONS: BoxPapers[] = ['full', 'box_only', 'none'];

export const VALUATION_SOURCE_LABELS: Record<ValuationSource, string> = {
  market: '二手成交',
  auction: '拍卖成交',
  dealer: '商家报价',
  community: '社区估价',
  self: '自评',
};

export const CONDITION_LABELS: Record<ConditionGrade, string> = {
  mint: '全新未拆',
  excellent: '近新',
  good: '良好',
  fair: '一般',
  poor: '战损',
};

export const BOX_PAPERS_LABELS: Record<BoxPapers, string> = {
  full: '箱说齐全',
  box_only: '仅有箱',
  none: '无箱说',
};
