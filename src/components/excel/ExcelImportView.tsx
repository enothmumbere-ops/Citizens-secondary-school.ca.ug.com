import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  fetchAssessments,
  fetchExcelImports,
  fetchStudents,
  fetchStudentSummaries,
  fetchTeacherAssignments,
  logAudit,
  saveAssessmentRecord,
  saveExcelImportRecord,
  saveFeesRecord,
  saveStudent,
  saveStudentTermSummary,
} from '../../services/firestoreService';
import { ClassCode, ExcelImportRecord, Student } from '../../types/sims';
import {
  autoDetectColumnMapping,
  ColumnMapping,
  downloadOfficialTemplateWorkbook,
  exportPerformanceWorkbook,
  ParsedImportRow,
  ParsedWorkbookInfo,
  parseExcelFile,
  validateMappedRows,
} from '../../utils/excelProcessor';
import { DEFAULT_GRADING_CONFIG } from '../../utils/grading';
import { useToast } from '../common/Toast';

export const ExcelImportView: React.FC = () => {
  const { userAccount, schoolSettings, years, terms, classes, subjects } = useAuth();
  const { showToast } = useToast();
  const uid = userAccount?.uid || '';

  const [targetYearId, setTargetYearId] = useState(
    schoolSettings?.currentAcademicYearId || years[0]?.id || 'yr_2026'
  );
  const [targetTermId, setTargetTermId] = useState(
    schoolSettings?.currentTermId || terms[0]?.id || 'term_2026_3'
  );
  const [targetClass, setTargetClass] = useState<ClassCode>('S.1');
  const [targetStream, setTargetStream] = useState('Main');

  const [workbook, setWorkbook] = useState<ParsedWorkbookInfo | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [validated, setValidated] = useState<{
    parsedRows: ParsedImportRow[];
    totalErrors: number;
    totalWarnings: number;
    discrepancyFlags: string[];
  } | null>(null);

  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [classConfirmed, setClassConfirmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importHistory, setImportHistory] = useState<ExcelImportRecord[]>([]);

  const loadHistory = useCallback(async () => {
    if (!uid) return;
    try {
      const list = await fetchExcelImports(uid);
      setImportHistory(list);
    } catch {
      setImportHistory([]);
    }
  }, [uid]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseExcelFile(file);
      setWorkbook(parsed);
      const defaultSheet = parsed.sheetNames.find((s) => s.toLowerCase() === 'sheet1') || parsed.sheetNames[0] || '';
      setSelectedSheet(defaultSheet);
      const sheetData = parsed.sheets[defaultSheet];
      if (sheetData) {
        const autoMap = autoDetectColumnMapping(sheetData.headers, subjects);
        setMapping(autoMap);
      }
      setValidated(null);
      setOverwriteConfirmed(false);
      setClassConfirmed(false);
      showToast(`Loaded "${file.name}" with ${parsed.sheetNames.length} worksheet(s).`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not parse Excel file.', 'error');
    }
  };

  const handleSheetChange = (sheetName: string) => {
    if (!workbook) return;
    setSelectedSheet(sheetName);
    const sheetData = workbook.sheets[sheetName];
    if (sheetData) {
      setMapping(autoDetectColumnMapping(sheetData.headers, subjects));
      setValidated(null);
    }
  };

  const handleValidate = async () => {
    if (!workbook || !selectedSheet || !mapping) return;
    const sheetData = workbook.sheets[selectedSheet];
    if (!sheetData) return;

    const [existingStudents, existingAssess] = await Promise.all([
      fetchStudents('admin', uid),
      fetchAssessments('admin', uid, { academicYearId: targetYearId, termId: targetTermId, classCode: targetClass }),
    ]);

    const res = validateMappedRows(
      sheetData.rows,
      mapping,
      existingStudents,
      existingAssess,
      targetClass,
      targetYearId,
      targetTermId,
      schoolSettings?.gradingConfig || DEFAULT_GRADING_CONFIG
    );
    setValidated(res);
  };

  const handleConfirmImport = async () => {
    if (!workbook || !validated) return;
    if (!classConfirmed) {
      showToast('Please confirm the target Class, Stream, Term, and Academic Year mapping.', 'error');
      return;
    }
    const hasConflicts = validated.parsedRows.some((r) => r.conflictsWithExisting);
    if (hasConflicts && !overwriteConfirmed) {
      showToast('Existing records detected for this class/term. Tick overwrite confirmation to proceed.', 'error');
      return;
    }

    setImporting(true);
    try {
      const [existingStudents, assignments] = await Promise.all([
        fetchStudents('admin', uid),
        fetchTeacherAssignments('admin', uid),
      ]);
      const authorizedTeacherUids = Array.from(
        new Set(
          assignments
            .filter((a) => a.classCode === targetClass && a.teacherUid)
            .map((a) => a.teacherUid as string)
        )
      ).slice(0, 35);

      const validRows = validated.parsedRows.filter((r) => r.studentName.trim().length > 0 && r.rowErrors.length === 0);
      let importedCount = 0;
      const warningsCollected: string[] = [];

      const rawPreview = (workbook.sheets[selectedSheet]?.rows || []).slice(0, 20);
      const importBatchId = await saveExcelImportRecord({
        fileName: workbook.fileName,
        academicYearId: targetYearId,
        termId: targetTermId,
        classCode: targetClass,
        stream: targetStream,
        sheetsFound: workbook.sheetNames,
        rowCount: validated.parsedRows.length,
        importedCount: validRows.length,
        warnings: validated.parsedRows.flatMap((r) => r.rowWarnings).slice(0, 50),
        conflictFlags: validated.discrepancyFlags.slice(0, 50),
        rawPreviewRows: rawPreview,
        uploadedByUid: uid,
        uploadedByEmail: userAccount?.email || '',
      });

      for (const row of validRows) {
        const matched: Student | undefined = existingStudents.find(
          (s) =>
            (row.schoolPayCode && s.schoolPayCode.toLowerCase() === row.schoolPayCode.toLowerCase()) ||
            s.fullName.toLowerCase() === row.studentName.toLowerCase()
        );

        const studentId = await saveStudent({
          id: matched?.id,
          studentNumber: matched?.studentNumber || `CSS-${targetClass.replace('.', '')}-${String(row.rowIndex).padStart(3, '0')}`,
          fullName: row.studentName,
          gender: row.gender,
          schoolPayCode: row.schoolPayCode,
          classCode: targetClass,
          stream: targetStream,
          academicYearId: targetYearId,
          status: matched?.status || 'active',
          email: matched?.email || '',
          studentAuthUid: matched?.studentAuthUid || '',
          authorizedTeacherUids,
        });

        for (const subjRow of row.subjects) {
          const subjObj = subjects.find((s) => s.name.toLowerCase() === subjRow.subjectName.toLowerCase());
          if (!subjObj) continue;
          await saveAssessmentRecord(
            {
              studentId,
              studentName: row.studentName,
              studentAuthUid: matched?.studentAuthUid || '',
              schoolPayCode: row.schoolPayCode,
              classCode: targetClass,
              stream: targetStream,
              academicYearId: targetYearId,
              termId: targetTermId,
              subjectId: subjObj.id,
              subjectName: subjObj.name,
              cumulativeAiScore: subjRow.cumulativeAiScore,
              identifier: subjRow.identifier,
              aiDescriptor: subjRow.aiDescriptor,
              formativeScore: subjRow.formativeScore,
              summativeScore: subjRow.summativeScore,
              totalScore: subjRow.totalScore,
              grade: subjRow.grade,
              descriptor: subjRow.descriptor,
              teacherInitials: subjRow.teacherInitials,
              authorizedTeacherUids,
              status: 'submitted',
              sourceImportId: importBatchId,
            },
            'admin'
          );
        }

        await saveStudentTermSummary(
          {
            studentId,
            studentName: row.studentName,
            gender: row.gender,
            schoolPayCode: row.schoolPayCode,
            studentAuthUid: matched?.studentAuthUid || '',
            classCode: targetClass,
            stream: targetStream,
            academicYearId: targetYearId,
            termId: targetTermId,
            averageAiIdentifier: row.summary.averageAiIdentifier,
            averageAiDescriptor: row.summary.averageAiDescriptor,
            averageTotalScore: row.summary.averageTotalScore,
            averageGrade: row.summary.averageGrade,
            averageFinal: row.summary.averageFinal,
            level: row.summary.level,
            position: row.summary.position,
            result: row.summary.result,
            classTeacherComment: row.summary.classTeacherComment,
            bursarComment: row.summary.bursarComment,
            headTeacherComment: row.summary.headTeacherComment,
            projectSubject: 'Art & Design',
            projectTitle: row.summary.projectTitle,
            projectPhase: row.summary.projectPhase,
            projectScore: row.summary.projectScore,
            projectRemarks: row.summary.projectRemarks,
            projectSupervisor: row.summary.projectSupervisor,
            authorizedTeacherUids,
            status: 'ready',
          },
          'admin'
        );

        if (row.summary.feesRequired !== null || row.summary.bursarComment) {
          const req = row.summary.feesRequired ?? 0;
          await saveFeesRecord({
            studentId,
            studentName: row.studentName,
            schoolPayCode: row.schoolPayCode,
            studentAuthUid: matched?.studentAuthUid || '',
            classCode: targetClass,
            stream: targetStream,
            academicYearId: targetYearId,
            termId: targetTermId,
            feesRequired: req,
            amountPaid: 0,
            balance: req,
            bursarComment: row.summary.bursarComment,
          });
        }

        if (row.rowWarnings.length > 0) warningsCollected.push(...row.rowWarnings);
        importedCount++;
      }

      await logAudit(
        'admin',
        'Excel Workbook Import',
        'excelImports',
        importBatchId,
        `Imported ${importedCount} student records from ${workbook.fileName} into ${targetClass} (${targetStream})`
      );
      showToast(`Imported ${importedCount} student records into ${targetClass}.`, 'success');
      setWorkbook(null);
      setValidated(null);
      await loadHistory();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Excel import failed.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleExportClassWorkbook = async () => {
    try {
      const [students, assessments, summaries] = await Promise.all([
        fetchStudents('admin', uid),
        fetchAssessments('admin', uid, { academicYearId: targetYearId, termId: targetTermId, classCode: targetClass }),
        fetchStudentSummaries('admin', uid, { academicYearId: targetYearId, termId: targetTermId, classCode: targetClass }),
      ]);
      const clsStudents = students.filter((s) => s.classCode === targetClass);
      const classSubjects = subjects.filter((s) => s.allowedClasses.includes(targetClass));
      exportPerformanceWorkbook(
        `CSS_${targetClass}_${targetTermId}_Performance.xlsx`,
        clsStudents,
        assessments,
        summaries,
        classSubjects
      );
      showToast('Exported Sheet1, BASLINE & GRADES workbook.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed.', 'error');
    }
  };

  const selectedClassObj = classes.find((c) => c.code === targetClass);
  const currentHeaders = workbook && selectedSheet ? workbook.sheets[selectedSheet]?.headers || [] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Excel Data Source Import &amp; Export</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Import <span className="font-mono text-xs">DATA SOURCE FOR TERM 3 ONLY S.1-S.4.xlsx</span> (Sheet1, BASLINE, GRADES) with verified class mapping.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadOfficialTemplateWorkbook}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-navy-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4 text-sky-600" />
            Download Official Template
          </button>
          <button
            type="button"
            onClick={handleExportClassWorkbook}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-navy-900 rounded-lg hover:bg-navy-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export {targetClass} Workbook
          </button>
        </div>
      </div>

      {/* Step 1: Target Context & Upload */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-bold text-navy-900">01. Select Target Class, Term &amp; Upload Workbook</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Because Sheet1 does not embed a class column in its first three columns, you must explicitly bind the import target below.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Academic Year</label>
            <select
              value={targetYearId}
              onChange={(e) => setTargetYearId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Term</label>
            <select
              value={targetTermId}
              onChange={(e) => setTargetTermId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {terms
                .filter((t) => t.academicYearId === targetYearId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Target Class</label>
            <select
              value={targetClass}
              onChange={(e) => setTargetClass(e.target.value as ClassCode)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Stream</label>
            <select
              value={targetStream}
              onChange={(e) => setTargetStream(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {(selectedClassObj?.streams.length ? selectedClassObj.streams : ['Main']).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-sky-500 rounded-xl p-8 cursor-pointer bg-slate-50/70 transition-colors">
          <Upload className="w-7 h-7 text-sky-600 mb-2" />
          <span className="text-sm font-semibold text-navy-900">
            {workbook ? `Loaded: ${workbook.fileName}` : 'Choose Excel Workbook (.xlsx / .xls)'}
          </span>
          <span className="text-xs text-slate-500 mt-1">
            Supports Sheet1, BASLINE, and GRADES worksheets
          </span>
          <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
        </label>
      </div>

      {/* Step 2: Worksheet Selection & Column Mapping */}
      {workbook && mapping && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-navy-900">02. Worksheet Inspection &amp; Column Mapping</h2>
              <p className="text-xs text-slate-500">
                Detected worksheets: {workbook.sheetNames.join(' · ')}
              </p>
            </div>
            <select
              value={selectedSheet}
              onChange={(e) => handleSheetChange(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {workbook.sheetNames.map((s) => (
                <option key={s} value={s}>
                  Worksheet: {s} ({workbook.sheets[s]?.rows.length || 0} rows)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Student Name Column *</label>
              <select
                value={mapping.studentName}
                onChange={(e) => setMapping({ ...mapping, studentName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">-- Select Column --</option>
                {currentHeaders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Gender Column</label>
              <select
                value={mapping.gender}
                onChange={(e) => setMapping({ ...mapping, gender: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">-- Select Column --</option>
                {currentHeaders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">School Pay Code Column</label>
              <select
                value={mapping.schoolPayCode}
                onChange={(e) => setMapping({ ...mapping, schoolPayCode: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">-- Select Column --</option>
                {currentHeaders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleValidate}
              className="px-4 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg cursor-pointer"
            >
              Preview &amp; Validate Rows
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Validation Results & Confirm Import */}
      {validated && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-navy-900">03. Validation &amp; Conflict Review</h2>
              <p className="text-xs text-slate-600 mt-0.5">
                {validated.parsedRows.length} rows scanned · {validated.totalErrors} errors · {validated.totalWarnings} warnings ·{' '}
                {validated.discrepancyFlags.length} formula discrepancies
              </p>
            </div>
          </div>

          {validated.discrepancyFlags.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                Grading Formula Discrepancies Flagged for Administrator Review
              </div>
              <ul className="text-xs text-amber-900 space-y-1 max-h-32 overflow-y-auto list-disc pl-4">
                {validated.discrepancyFlags.slice(0, 15).map((flag, i) => (
                  <li key={i}>{flag}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto max-h-80 border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 sticky top-0">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Student Name</th>
                  <th className="px-3 py-2">Gender</th>
                  <th className="px-3 py-2">Pay Code</th>
                  <th className="px-3 py-2 text-right">Subjects Mapped</th>
                  <th className="px-3 py-2">Validation Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {validated.parsedRows.slice(0, 100).map((row) => (
                  <tr key={row.rowIndex}>
                    <td className="px-3 py-2 tabular-nums text-slate-500">{row.rowIndex}</td>
                    <td className="px-3 py-2 font-medium text-navy-900">{row.studentName || '—'}</td>
                    <td className="px-3 py-2">{row.gender}</td>
                    <td className="px-3 py-2 font-mono">{row.schoolPayCode || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.subjects.length}</td>
                    <td className="px-3 py-2">
                      {row.rowErrors.length > 0 ? (
                        <span className="text-red-700 font-medium">{row.rowErrors[0]}</span>
                      ) : row.rowWarnings.length > 0 ? (
                        <span className="text-amber-700">{row.rowWarnings[0]}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-200 text-xs">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={classConfirmed}
                onChange={(e) => setClassConfirmed(e.target.checked)}
                className="w-4 h-4 accent-navy-900"
              />
              <span className="font-medium text-slate-800">
                I confirm these records belong to <span className="font-bold text-navy-900">{targetClass} ({targetStream})</span> for the selected Academic Year and Term.
              </span>
            </label>

            {validated.parsedRows.some((r) => r.conflictsWithExisting) && (
              <label className="flex items-center gap-2.5 cursor-pointer text-amber-900">
                <input
                  type="checkbox"
                  checked={overwriteConfirmed}
                  onChange={(e) => setOverwriteConfirmed(e.target.checked)}
                  className="w-4 h-4 accent-amber-700"
                />
                <span className="font-medium">
                  Existing assessment records were detected. I authorize overwriting matching student results in {targetClass}.
                </span>
              </label>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={importing}
                onClick={handleConfirmImport}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg disabled:opacity-60 cursor-pointer"
              >
                {importing ? 'Importing to Firestore...' : 'Confirm & Import Valid Records'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-navy-900">Uploaded Workbook Reference Archive</h2>
          <p className="text-xs text-slate-500">Preserved audit trail of official school Excel imports.</p>
        </div>
        {importHistory.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No Excel workbooks have been imported yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">File Name</th>
                  <th className="px-5 py-3">Class / Stream</th>
                  <th className="px-5 py-3">Worksheets</th>
                  <th className="px-5 py-3 text-right">Imported Rows</th>
                  <th className="px-5 py-3">Uploaded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {importHistory.map((imp) => (
                  <tr key={imp.id}>
                    <td className="px-5 py-3 font-medium text-navy-900">{imp.fileName}</td>
                    <td className="px-5 py-3">
                      {imp.classCode} {imp.stream ? `· ${imp.stream}` : ''}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-600">{imp.sheetsFound.join(', ')}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold">
                      {imp.importedCount} / {imp.rowCount}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-600">{imp.uploadedByEmail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
