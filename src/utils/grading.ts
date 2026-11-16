import { AiDescriptorBand, ClassCode, GradeBand, GradingConfig, ReportCardSubjectRow, Subject } from '../types/sims';

export const DEFAULT_SUBJECTS: Array<{ name: string; code: string; allowedClasses: ClassCode[]; isCompulsory: boolean }> = [
  { name: 'English', code: 'ENG', allowedClasses: ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'], isCompulsory: true },
  { name: 'History', code: 'HIS', allowedClasses: ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'], isCompulsory: true },
  { name: 'Geography', code: 'GEO', allowedClasses: ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'], isCompulsory: true },
  { name: 'Physical Education', code: 'PE', allowedClasses: ['S.1', 'S.2', 'S.3', 'S.4'], isCompulsory: true },
  { name: 'Mathematics', code: 'MTC', allowedClasses: ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'], isCompulsory: true },
  { name: 'Physics', code: 'PHY', allowedClasses: ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'], isCompulsory: true },
  { name: 'Chemistry', code: 'CHE', allowedClasses: ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'], isCompulsory: true },
  { name: 'Biology', code: 'BIO', allowedClasses: ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'], isCompulsory: true },
  { name: 'P. Agriculture', code: 'AGR', allowedClasses: ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'], isCompulsory: false },
  { name: 'C.R.E.', code: 'CRE', allowedClasses: ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'], isCompulsory: false },
  { name: 'Kiswahili', code: 'KIS', allowedClasses: ['S.1', 'S.2', 'S.3', 'S.4'], isCompulsory: false },
  { name: 'Entrepreneurship Education', code: 'ENT', allowedClasses: ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'], isCompulsory: false },
  { name: 'Art & Design', code: 'ART', allowedClasses: ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'], isCompulsory: false },
  { name: 'I.C.T.', code: 'ICT', allowedClasses: ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'], isCompulsory: false },
];

export const DEFAULT_GRADING_CONFIG: GradingConfig = {
  formativeWeight: 20,
  summativeWeight: 80,
  aiMaxScore: 3,
  aiBands: [
    { identifier: 3, minScore: 2.5, maxScore: 3.0, descriptor: 'Outstanding' },
    { identifier: 2, minScore: 1.5, maxScore: 2.49, descriptor: 'Moderate' },
    { identifier: 1, minScore: 0.0, maxScore: 1.49, descriptor: 'Basic' },
  ],
  gradeBands: [
    { grade: 'A', minScore: 80, maxScore: 100, descriptor: 'Outstanding', levelLabel: 'Exceptional' },
    { grade: 'B', minScore: 65, maxScore: 79.99, descriptor: 'Moderate', levelLabel: 'Very Good' },
    { grade: 'C', minScore: 50, maxScore: 64.99, descriptor: 'Moderate', levelLabel: 'Satisfactory' },
    { grade: 'D', minScore: 35, maxScore: 49.99, descriptor: 'Basic', levelLabel: 'Basic' },
    { grade: 'E', minScore: 0, maxScore: 34.99, descriptor: 'Basic', levelLabel: 'Elementary' },
  ],
  requiresAdminConfirmation: true,
  conflictNotes: [
    'Default NCDC competency bands active. Upload DATA SOURCE FOR TERM 3 ONLY S.1-S.4.xlsx or verify in Settings to confirm exact school workbook grading thresholds.',
  ],
};

export function roundToOne(val: number): number {
  return Math.round(val * 10) / 10;
}

export function roundToTwo(val: number): number {
  return Math.round(val * 100) / 100;
}

export function calculateAiMetrics(
  cumulativeAiScore: number | null | undefined,
  config: GradingConfig = DEFAULT_GRADING_CONFIG
): {
  identifier: 1 | 2 | 3 | null;
  aiDescriptor: string;
  formativeScore: number | null;
} {
  if (cumulativeAiScore === null || cumulativeAiScore === undefined || Number.isNaN(cumulativeAiScore)) {
    return { identifier: null, aiDescriptor: '', formativeScore: null };
  }
  const clamped = Math.max(0, Math.min(config.aiMaxScore, cumulativeAiScore));
  const formativeScore = roundToOne((clamped / config.aiMaxScore) * config.formativeWeight);

  let matched: AiDescriptorBand | undefined = config.aiBands.find(
    (b) => clamped >= b.minScore && clamped <= b.maxScore
  );
  if (!matched) {
    matched = clamped >= 2.5 ? config.aiBands[0] : clamped >= 1.5 ? config.aiBands[1] : config.aiBands[2];
  }

  return {
    identifier: matched.identifier,
    aiDescriptor: matched.descriptor,
    formativeScore,
  };
}

export function calculateSubjectResult(
  cumulativeAiScore: number | null | undefined,
  summativeScore: number | null | undefined,
  config: GradingConfig = DEFAULT_GRADING_CONFIG
): {
  identifier: 1 | 2 | 3 | null;
  aiDescriptor: string;
  formativeScore: number | null;
  totalScore: number | null;
  grade: string;
  descriptor: string;
} {
  const ai = calculateAiMetrics(cumulativeAiScore, config);

  if (
    ai.formativeScore === null ||
    summativeScore === null ||
    summativeScore === undefined ||
    Number.isNaN(summativeScore)
  ) {
    return {
      ...ai,
      totalScore: null,
      grade: '',
      descriptor: '',
    };
  }

  const totalScore = roundToOne(ai.formativeScore + summativeScore);
  const band: GradeBand | undefined = config.gradeBands.find(
    (b) => totalScore >= b.minScore && totalScore <= b.maxScore
  );

  return {
    ...ai,
    totalScore,
    grade: band ? band.grade : 'E',
    descriptor: band ? band.descriptor : 'Basic',
  };
}

export function validateScoreInputs(
  cumulativeAiScore: number | null | undefined,
  summativeScore: number | null | undefined,
  config: GradingConfig = DEFAULT_GRADING_CONFIG
): string[] {
  const errors: string[] = [];
  if (cumulativeAiScore !== null && cumulativeAiScore !== undefined) {
    if (Number.isNaN(cumulativeAiScore)) {
      errors.push('Cumulative AI score must be a valid number.');
    } else if (cumulativeAiScore < 0) {
      errors.push('Cumulative AI score cannot be negative.');
    } else if (cumulativeAiScore > config.aiMaxScore) {
      errors.push(`Cumulative AI score cannot exceed ${config.aiMaxScore}.`);
    }
  }
  if (summativeScore !== null && summativeScore !== undefined) {
    if (Number.isNaN(summativeScore)) {
      errors.push('Summative score must be a valid number.');
    } else if (summativeScore < 0) {
      errors.push('Summative score cannot be negative.');
    } else if (summativeScore > config.summativeWeight) {
      errors.push(`Summative score cannot exceed ${config.summativeWeight}%.`);
    }
  }
  return errors;
}

export function formatUgx(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return `UGX ${Math.round(amount).toLocaleString('en-UG')}`;
}

const DEFAULT_SUBJECT_ORDER = new Map(
  DEFAULT_SUBJECTS.map((s, idx) => [s.name.toLowerCase(), idx])
);

const DEFAULT_COMPULSORY_SET = new Set(
  DEFAULT_SUBJECTS.filter((s) => s.isCompulsory).map((s) => s.name.toLowerCase())
);

export function sortSubjectsForReport(subjects: Subject[]): Subject[] {
  return [...subjects].sort((a, b) => {
    const aName = a.name.trim().toLowerCase();
    const bName = b.name.trim().toLowerCase();
    const aIsEng = aName === 'english' || (a.code || '').toUpperCase() === 'ENG';
    const bIsEng = bName === 'english' || (b.code || '').toUpperCase() === 'ENG';
    if (aIsEng !== bIsEng) return aIsEng ? -1 : 1;

    if (a.isCompulsory !== b.isCompulsory) return a.isCompulsory ? -1 : 1;

    const aIdx = DEFAULT_SUBJECT_ORDER.get(aName);
    const bIdx = DEFAULT_SUBJECT_ORDER.get(bName);
    if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
    if (aIdx !== undefined) return -1;
    if (bIdx !== undefined) return 1;

    return a.name.localeCompare(b.name);
  });
}

export function sortReportCardRows(
  rows: ReportCardSubjectRow[],
  subjects: Subject[] = []
): ReportCardSubjectRow[] {
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const byName = new Map(subjects.map((s) => [s.name.trim().toLowerCase(), s]));

  const isCompulsoryRow = (row: ReportCardSubjectRow): boolean => {
    const subj = byId.get(row.subjectId) || byName.get(row.subjectName.trim().toLowerCase());
    if (subj) return subj.isCompulsory;
    return DEFAULT_COMPULSORY_SET.has(row.subjectName.trim().toLowerCase());
  };

  return [...rows].sort((a, b) => {
    const aName = a.subjectName.trim().toLowerCase();
    const bName = b.subjectName.trim().toLowerCase();
    const aIsEng = aName === 'english';
    const bIsEng = bName === 'english';
    if (aIsEng !== bIsEng) return aIsEng ? -1 : 1;

    const aComp = isCompulsoryRow(a);
    const bComp = isCompulsoryRow(b);
    if (aComp !== bComp) return aComp ? -1 : 1;

    const aIdx = DEFAULT_SUBJECT_ORDER.get(aName);
    const bIdx = DEFAULT_SUBJECT_ORDER.get(bName);
    if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
    if (aIdx !== undefined) return -1;
    if (bIdx !== undefined) return 1;

    return a.subjectName.localeCompare(b.subjectName);
  });
}
