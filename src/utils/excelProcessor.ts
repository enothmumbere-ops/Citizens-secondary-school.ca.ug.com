import * as XLSX from 'xlsx';
import {
  AssessmentRecord,
  ClassCode,
  GradingConfig,
  Student,
  StudentTermSummary,
  Subject,
} from '../types/sims';
import {
  calculateSubjectResult,
  DEFAULT_GRADING_CONFIG,
  DEFAULT_SUBJECTS,
  validateScoreInputs,
} from './grading';

export interface ParsedWorkbookInfo {
  fileName: string;
  sheetNames: string[];
  hasSheet1: boolean;
  hasBaseline: boolean;
  hasGrades: boolean;
  sheets: Record<
    string,
    {
      headers: string[];
      rows: Record<string, unknown>[];
      rawMatrix: unknown[][];
    }
  >;
}

export interface ColumnMapping {
  studentName: string;
  gender: string;
  schoolPayCode: string;
  averageAiIdentifier?: string;
  averageAiDescriptor?: string;
  averageTotalScore?: string;
  averageGrade?: string;
  averageFinal?: string;
  level?: string;
  position?: string;
  result?: string;
  classTeacherComment?: string;
  feesRequired?: string;
  bursarComment?: string;
  headTeacherComment?: string;
  projectTitle?: string;
  projectPhase?: string;
  projectScore?: string;
  projectRemarks?: string;
  projectSupervisor?: string;
  subjectMappings: Record<
    string,
    {
      cumulativeAiScore?: string;
      identifier?: string;
      aiDescriptor?: string;
      formativeScore?: string;
      summativeScore?: string;
      totalScore?: string;
      grade?: string;
      descriptor?: string;
      teacherInitials?: string;
    }
  >;
}

export interface ParsedImportRow {
  rowIndex: number;
  studentName: string;
  gender: 'M' | 'F';
  schoolPayCode: string;
  subjects: Array<{
    subjectName: string;
    cumulativeAiScore: number | null;
    identifier: number | null;
    aiDescriptor: string;
    formativeScore: number | null;
    summativeScore: number | null;
    totalScore: number | null;
    grade: string;
    descriptor: string;
    teacherInitials: string;
    errors: string[];
    discrepancies: string[];
  }>;
  summary: {
    averageAiIdentifier: number | null;
    averageAiDescriptor: string;
    averageTotalScore: number | null;
    averageGrade: string;
    averageFinal: number | null;
    level: string;
    position: string;
    result: string;
    classTeacherComment: string;
    feesRequired: number | null;
    bursarComment: string;
    headTeacherComment: string;
    projectTitle: string;
    projectPhase: string;
    projectScore: number | null;
    projectRemarks: string;
    projectSupervisor: string;
  };
  rowErrors: string[];
  rowWarnings: string[];
  isDuplicate: boolean;
  conflictsWithExisting: boolean;
}

function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function toNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(String(val).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function toStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

export async function parseExcelFile(file: File): Promise<ParsedWorkbookInfo> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellFormula: true });

  const sheets: ParsedWorkbookInfo['sheets'] = {};
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

    // Detect best header row (first row with >= 3 non-empty string headers, preferring row containing "Student" or "Name")
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(10, rawMatrix.length); i++) {
      const row = rawMatrix[i] || [];
      const rowText = row.map((c) => String(c).toLowerCase()).join(' ');
      if (rowText.includes('student name') || rowText.includes('school pay')) {
        headerRowIdx = i;
        break;
      }
      const nonEmpty = row.filter((c) => String(c ?? '').trim().length > 0).length;
      if (nonEmpty >= 3 && headerRowIdx === 0) {
        headerRowIdx = i;
      }
    }

    const rawHeaders = rawMatrix[headerRowIdx] || [];
    const seenCounts: Record<string, number> = {};
    const headers = rawHeaders.map((h, idx) => {
      const base = normalizeHeader(h) || `Column_${idx + 1}`;
      seenCounts[base] = (seenCounts[base] || 0) + 1;
      return seenCounts[base] > 1 ? `${base} (${seenCounts[base]})` : base;
    });

    const rows: Record<string, unknown>[] = [];
    for (let r = headerRowIdx + 1; r < rawMatrix.length; r++) {
      const arr = rawMatrix[r] || [];
      const hasAny = arr.some((c) => String(c ?? '').trim() !== '');
      if (!hasAny) continue;
      const obj: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        obj[h] = arr[idx] ?? '';
      });
      rows.push(obj);
    }

    sheets[name] = { headers, rows, rawMatrix };
  }

  return {
    fileName: file.name,
    sheetNames: workbook.SheetNames,
    hasSheet1: workbook.SheetNames.some((s) => s.toLowerCase() === 'sheet1'),
    hasBaseline: workbook.SheetNames.some((s) => s.toLowerCase().includes('basline') || s.toLowerCase().includes('baseline')),
    hasGrades: workbook.SheetNames.some((s) => s.toLowerCase().includes('grade')),
    sheets,
  };
}

export function autoDetectColumnMapping(
  headers: string[],
  subjects: Subject[]
): ColumnMapping {
  const findCol = (patterns: string[]): string => {
    for (const p of patterns) {
      const exact = headers.find((h) => h.toLowerCase() === p.toLowerCase());
      if (exact) return exact;
    }
    for (const p of patterns) {
      const partial = headers.find((h) => h.toLowerCase().includes(p.toLowerCase()));
      if (partial) return partial;
    }
    return '';
  };

  const subjectMappings: ColumnMapping['subjectMappings'] = {};
  for (const subj of subjects) {
    const sLower = subj.name.toLowerCase();
    const sCode = (subj.code || '').toLowerCase();
    const matchSubjectCol = (fieldHints: string[]): string => {
      return (
        headers.find((h) => {
          const hl = h.toLowerCase();
          const hasSubj = hl.includes(sLower) || (sCode && hl.startsWith(sCode + ' '));
          return hasSubj && fieldHints.some((hint) => hl.includes(hint));
        }) || ''
      );
    };
    subjectMappings[subj.name] = {
      cumulativeAiScore: matchSubjectCol(['ai score', 'cumulative ai', 'cum ai', 'ai (x/3)']),
      identifier: matchSubjectCol(['identifier', 'ident']),
      aiDescriptor: matchSubjectCol(['ai descriptor']),
      formativeScore: matchSubjectCol(['formative', '20%']),
      summativeScore: matchSubjectCol(['summative', '80%', 'eoy']),
      totalScore: matchSubjectCol(['total']),
      grade: matchSubjectCol(['grade']),
      descriptor: matchSubjectCol(['descriptor']),
      teacherInitials: matchSubjectCol(['initial', 'tr']),
    };
  }

  return {
    studentName: findCol(['Student Name', 'Name', 'Learner Name', 'Full Name']),
    gender: findCol(['Gender', 'Sex']),
    schoolPayCode: findCol(['School Pay Code', 'Pay Code', 'SchoolPay', 'PayCode']),
    averageAiIdentifier: findCol(['Average AI Identifier', 'Avg AI Identifier']),
    averageAiDescriptor: findCol(['Average AI Descriptor', 'Avg AI Descriptor']),
    averageTotalScore: findCol(['Average Total Score', 'Avg Total']),
    averageGrade: findCol(['Average Grade', 'Avg Grade']),
    averageFinal: findCol(['Average Final', 'Avg Final']),
    level: findCol(['Level']),
    position: findCol(['Position', 'Pos']),
    result: findCol(['Result']),
    classTeacherComment: findCol(["Class Teacher's Comment", 'Class Teacher Comment']),
    feesRequired: findCol(['Fees Required', 'Fees']),
    bursarComment: findCol(["Bursar's Comment", 'Bursar Comment']),
    headTeacherComment: findCol(["Head Teacher's Comment", 'Head Teacher Comment']),
    projectTitle: findCol(['Project Title']),
    projectPhase: findCol(['Project Phase']),
    projectScore: findCol(['Project Score']),
    projectRemarks: findCol(['Remarks', 'Project Remarks']),
    projectSupervisor: findCol(["Supervisor's Name", 'Supervisor Name', 'Supervisor']),
    subjectMappings,
  };
}

export function validateMappedRows(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
  existingStudents: Student[],
  existingAssessments: AssessmentRecord[],
  targetClass: ClassCode,
  targetYearId: string,
  targetTermId: string,
  gradingConfig: GradingConfig = DEFAULT_GRADING_CONFIG
): {
  parsedRows: ParsedImportRow[];
  totalErrors: number;
  totalWarnings: number;
  discrepancyFlags: string[];
} {
  const seenPayCodes = new Set<string>();
  const seenNames = new Set<string>();
  const discrepancyFlags: string[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  const parsedRows: ParsedImportRow[] = rows.map((row, idx) => {
    const rowErrors: string[] = [];
    const rowWarnings: string[] = [];

    const studentName = toStr(row[mapping.studentName]);
    const rawGender = toStr(row[mapping.gender]).toUpperCase();
    const gender: 'M' | 'F' = rawGender.startsWith('F') ? 'F' : rawGender.startsWith('M') ? 'M' : 'M';
    const schoolPayCode = toStr(row[mapping.schoolPayCode]);

    if (!studentName) {
      rowErrors.push('Missing student name.');
    }
    if (!rawGender || (!rawGender.startsWith('M') && !rawGender.startsWith('F'))) {
      rowWarnings.push('Gender missing or unrecognized; defaulted to M for review.');
    }
    if (!schoolPayCode) {
      rowWarnings.push('Missing School Pay Code.');
    }

    const nameKey = studentName.toLowerCase();
    let isDuplicate = false;
    if (schoolPayCode && seenPayCodes.has(schoolPayCode.toLowerCase())) {
      isDuplicate = true;
      rowErrors.push(`Duplicate School Pay Code "${schoolPayCode}" in spreadsheet.`);
    }
    if (nameKey && seenNames.has(nameKey)) {
      isDuplicate = true;
      rowWarnings.push(`Duplicate student name "${studentName}" in spreadsheet.`);
    }
    if (schoolPayCode) seenPayCodes.add(schoolPayCode.toLowerCase());
    if (nameKey) seenNames.add(nameKey);

    const existingStudent = existingStudents.find(
      (s) =>
        (schoolPayCode && s.schoolPayCode.toLowerCase() === schoolPayCode.toLowerCase()) ||
        s.fullName.toLowerCase() === nameKey
    );

    const conflictsWithExisting = Boolean(
      existingStudent &&
        existingAssessments.some(
          (a) =>
            a.studentId === existingStudent.id &&
            a.classCode === targetClass &&
            a.academicYearId === targetYearId &&
            a.termId === targetTermId
        )
    );
    if (conflictsWithExisting) {
      rowWarnings.push('Existing assessment records found for this student in selected Class/Term/Year.');
    }

    const subjects: ParsedImportRow['subjects'] = [];
    for (const [subjectName, cols] of Object.entries(mapping.subjectMappings)) {
      const hasAnyCol = Object.values(cols).some(Boolean);
      if (!hasAnyCol) continue;

      const cumulativeAiScore = cols.cumulativeAiScore ? toNum(row[cols.cumulativeAiScore]) : null;
      const summativeScore = cols.summativeScore ? toNum(row[cols.summativeScore]) : null;
      const sheetFormative = cols.formativeScore ? toNum(row[cols.formativeScore]) : null;
      const sheetTotal = cols.totalScore ? toNum(row[cols.totalScore]) : null;
      const sheetGrade = cols.grade ? toStr(row[cols.grade]) : '';
      const sheetIdentifier = cols.identifier ? toNum(row[cols.identifier]) : null;
      const sheetAiDesc = cols.aiDescriptor ? toStr(row[cols.aiDescriptor]) : '';
      const sheetDesc = cols.descriptor ? toStr(row[cols.descriptor]) : '';
      const teacherInitials = cols.teacherInitials ? toStr(row[cols.teacherInitials]) : '';

      const hasAnyValue =
        cumulativeAiScore !== null ||
        summativeScore !== null ||
        sheetTotal !== null ||
        Boolean(sheetGrade);

      if (!hasAnyValue) continue;

      const valErrors = validateScoreInputs(cumulativeAiScore, summativeScore, gradingConfig);
      const calc = calculateSubjectResult(cumulativeAiScore, summativeScore, gradingConfig);
      const discrepancies: string[] = [];

      if (sheetTotal !== null && calc.totalScore !== null && Math.abs(sheetTotal - calc.totalScore) > 0.5) {
        const msg = `Row ${idx + 1} (${studentName}) · ${subjectName}: Spreadsheet Total (${sheetTotal}) differs from computed (${calc.totalScore}).`;
        discrepancies.push(msg);
        if (discrepancyFlags.length < 40) discrepancyFlags.push(msg);
      }

      if (sheetGrade && calc.grade && sheetGrade.toUpperCase() !== calc.grade.toUpperCase()) {
        const msg = `Row ${idx + 1} (${studentName}) · ${subjectName}: Spreadsheet Grade "${sheetGrade}" differs from rule grade "${calc.grade}".`;
        discrepancies.push(msg);
        if (discrepancyFlags.length < 40) discrepancyFlags.push(msg);
      }

      subjects.push({
        subjectName,
        cumulativeAiScore,
        identifier: sheetIdentifier ?? calc.identifier,
        aiDescriptor: sheetAiDesc || calc.aiDescriptor,
        formativeScore: sheetFormative ?? calc.formativeScore,
        summativeScore,
        totalScore: sheetTotal ?? calc.totalScore,
        grade: sheetGrade || calc.grade,
        descriptor: sheetDesc || calc.descriptor,
        teacherInitials,
        errors: valErrors,
        discrepancies,
      });

      if (valErrors.length > 0) {
        rowErrors.push(...valErrors.map((e) => `${subjectName}: ${e}`));
      }
    }

    totalErrors += rowErrors.length;
    totalWarnings += rowWarnings.length;

    return {
      rowIndex: idx + 1,
      studentName,
      gender,
      schoolPayCode,
      subjects,
      summary: {
        averageAiIdentifier: mapping.averageAiIdentifier ? toNum(row[mapping.averageAiIdentifier]) : null,
        averageAiDescriptor: mapping.averageAiDescriptor ? toStr(row[mapping.averageAiDescriptor]) : '',
        averageTotalScore: mapping.averageTotalScore ? toNum(row[mapping.averageTotalScore]) : null,
        averageGrade: mapping.averageGrade ? toStr(row[mapping.averageGrade]) : '',
        averageFinal: mapping.averageFinal ? toNum(row[mapping.averageFinal]) : null,
        level: mapping.level ? toStr(row[mapping.level]) : '',
        position: mapping.position ? toStr(row[mapping.position]) : '',
        result: mapping.result ? toStr(row[mapping.result]) : '',
        classTeacherComment: mapping.classTeacherComment ? toStr(row[mapping.classTeacherComment]) : '',
        feesRequired: mapping.feesRequired ? toNum(row[mapping.feesRequired]) : null,
        bursarComment: mapping.bursarComment ? toStr(row[mapping.bursarComment]) : '',
        headTeacherComment: mapping.headTeacherComment ? toStr(row[mapping.headTeacherComment]) : '',
        projectTitle: mapping.projectTitle ? toStr(row[mapping.projectTitle]) : '',
        projectPhase: mapping.projectPhase ? toStr(row[mapping.projectPhase]) : '',
        projectScore: mapping.projectScore ? toNum(row[mapping.projectScore]) : null,
        projectRemarks: mapping.projectRemarks ? toStr(row[mapping.projectRemarks]) : '',
        projectSupervisor: mapping.projectSupervisor ? toStr(row[mapping.projectSupervisor]) : '',
      },
      rowErrors,
      rowWarnings,
      isDuplicate,
      conflictsWithExisting,
    };
  });

  return { parsedRows, totalErrors, totalWarnings, discrepancyFlags };
}

export function downloadOfficialTemplateWorkbook(): void {
  const wb = XLSX.utils.book_new();

  const sheet1Headers: string[] = ['Student Name', 'Gender', 'School Pay Code'];
  for (const subj of DEFAULT_SUBJECTS) {
    sheet1Headers.push(
      `${subj.name} Cumulative AI Score`,
      `${subj.name} Identifier`,
      `${subj.name} AI Descriptor`,
      `${subj.name} Formative Score`,
      `${subj.name} Summative Score`,
      `${subj.name} Total Score`,
      `${subj.name} Grade`,
      `${subj.name} Descriptor`,
      `${subj.name} Teacher's Initials`
    );
  }
  sheet1Headers.push(
    'Average AI Identifier',
    'Average AI Descriptor',
    'Average Total Score',
    'Average Grade',
    'Average Final',
    'Level',
    'Position',
    'Result',
    "Class Teacher's Comment",
    'Fees Required',
    "Bursar's Comment",
    "Head Teacher's Comment",
    'Project Title',
    'Project Phase',
    'Project Score',
    'Remarks',
    "Supervisor's Name"
  );

  const ws1 = XLSX.utils.aoa_to_sheet([sheet1Headers]);
  const wsBaseline = XLSX.utils.aoa_to_sheet([
    ['Student Name', 'Gender', 'School Pay Code', 'Cumulative AI Baseline', 'End-of-Term Baseline', 'Level'],
  ]);
  const wsGrades = XLSX.utils.aoa_to_sheet([
    ['Student Name', 'School Pay Code', ...DEFAULT_SUBJECTS.map((s) => `${s.name} Grade`), 'Average Score', 'Average Grade', 'Position'],
  ]);

  XLSX.utils.book_append_sheet(wb, ws1, 'Sheet1');
  XLSX.utils.book_append_sheet(wb, wsBaseline, 'BASLINE');
  XLSX.utils.book_append_sheet(wb, wsGrades, 'GRADES');

  XLSX.writeFile(wb, 'CSS_Official_Assessment_Template.xlsx');
}

export function exportPerformanceWorkbook(
  fileName: string,
  students: Student[],
  assessments: AssessmentRecord[],
  summaries: StudentTermSummary[],
  subjects: Subject[]
): void {
  const wb = XLSX.utils.book_new();

  const sheet1Rows = students.map((st) => {
    const stAssess = assessments.filter((a) => a.studentId === st.id);
    const sum = summaries.find((s) => s.studentId === st.id);
    const row: Record<string, string | number> = {
      'Student Number': st.studentNumber,
      'Student Name': st.fullName,
      Gender: st.gender,
      'School Pay Code': st.schoolPayCode,
      Class: st.classCode,
      Stream: st.stream || '',
    };

    for (const subj of subjects) {
      const rec = stAssess.find((a) => a.subjectId === subj.id || a.subjectName === subj.name);
      row[`${subj.name} AI (0-3)`] = rec?.cumulativeAiScore ?? '';
      row[`${subj.name} Formative (20%)`] = rec?.formativeScore ?? '';
      row[`${subj.name} Summative (80%)`] = rec?.summativeScore ?? '';
      row[`${subj.name} Total (100%)`] = rec?.totalScore ?? '';
      row[`${subj.name} Grade`] = rec?.grade ?? '';
      row[`${subj.name} Descriptor`] = rec?.descriptor ?? '';
      row[`${subj.name} Initials`] = rec?.teacherInitials ?? '';
    }

    row['Average Total Score'] = sum?.averageTotalScore ?? '';
    row['Average Grade'] = sum?.averageGrade ?? '';
    row['Position'] = sum?.position ?? '';
    row['Result'] = sum?.result ?? '';
    return row;
  });

  const baselineRows = students.map((st) => {
    const sum = summaries.find((s) => s.studentId === st.id);
    return {
      'Student Name': st.fullName,
      Gender: st.gender,
      'School Pay Code': st.schoolPayCode,
      'Average AI Identifier': sum?.averageAiIdentifier ?? '',
      'Average AI Descriptor': sum?.averageAiDescriptor ?? '',
      'Average Final': sum?.averageFinal ?? '',
      Level: sum?.level ?? '',
    };
  });

  const gradeRows = students.map((st) => {
    const stAssess = assessments.filter((a) => a.studentId === st.id);
    const sum = summaries.find((s) => s.studentId === st.id);
    const r: Record<string, string | number> = {
      'Student Name': st.fullName,
      'School Pay Code': st.schoolPayCode,
    };
    for (const subj of subjects) {
      const rec = stAssess.find((a) => a.subjectId === subj.id || a.subjectName === subj.name);
      r[`${subj.name} Grade`] = rec?.grade ?? '';
    }
    r['Average Grade'] = sum?.averageGrade ?? '';
    r['Position'] = sum?.position ?? '';
    return r;
  });

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet1Rows), 'Sheet1');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(baselineRows), 'BASLINE');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gradeRows), 'GRADES');

  XLSX.writeFile(wb, fileName);
}
