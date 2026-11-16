import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ReportCard, SchoolSettings, Subject } from '../types/sims';
import { formatUgx, sortReportCardRows } from './grading';

const SCHOOL_LOGO_PATH = '/assets/aistudio/Citizens_s.s_a01937a3.jpg';
let cachedLogoDataUrl: string | null = null;

async function getSchoolLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const res = await fetch(SCHOOL_LOGO_PATH);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    cachedLogoDataUrl = dataUrl;
    return dataUrl;
  } catch {
    return null;
  }
}

function renderReportCardPage(
  doc: jsPDF,
  card: ReportCard,
  settings: SchoolSettings,
  isFirstPage: boolean,
  logoDataUrl: string | null,
  subjects: Subject[] = []
): void {
  if (!isFirstPage) {
    doc.addPage('a4', 'portrait');
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;

  // Outer institutional frame
  doc.setDrawColor(15, 39, 68);
  doc.setLineWidth(0.7);
  doc.rect(margin - 3, margin - 3, contentWidth + 6, 276);

  // Header Band
  doc.setFillColor(15, 39, 68);
  doc.rect(margin, margin, contentWidth, 30, 'F');

  if (logoDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 2, margin + 3, 24, 24, 1.5, 1.5, 'F');
    doc.addImage(logoDataUrl, 'JPEG', margin + 2.8, margin + 3.8, 22.4, 22.4);
  }

  // Top-right corner: Student Passport Photo Space
  const photoW = 22;
  const photoH = 26;
  const photoX = margin + contentWidth - photoW - 2;
  const photoY = margin + 2;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(photoX, photoY, photoW, photoH, 1, 1, 'FD');

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.25);
  doc.setLineDashPattern([1.2, 1.2], 0);
  doc.rect(photoX + 1.4, photoY + 1.4, photoW - 2.8, photoH - 2.8, 'D');
  doc.setLineDashPattern([], 0);

  // Subtle portrait head & shoulders outline inside photo space
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.circle(photoX + photoW / 2, photoY + 7.5, 2.7, 'D');
  doc.roundedRect(photoX + 5.8, photoY + 11, photoW - 11.6, 4.2, 1.5, 1.5, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(15, 39, 68);
  doc.text('STUDENT PHOTO', photoX + photoW / 2, photoY + 19.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.4);
  doc.setTextColor(100, 116, 139);
  doc.text('Passport Size', photoX + photoW / 2, photoY + 23, { align: 'center' });

  const textCenterX = pageWidth / 2;

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(settings.schoolName.toUpperCase(), textCenterX, margin + 10, { align: 'center' });

  doc.setFontSize(8.8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(125, 211, 252);
  doc.text(`Motto: "${settings.motto}"`, textCenterX, margin + 16, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(226, 232, 240);
  doc.text(
    `${settings.address}  |  Tel: ${settings.phones}  |  Email: ${settings.email}`,
    textCenterX,
    margin + 22.5,
    { align: 'center' }
  );

  // Sub-heading
  let y = margin + 35;
  doc.setTextColor(15, 39, 68);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PROGRESSIVE TERMLY REPORT FORM', pageWidth / 2, y, { align: 'center' });

  y += 4;
  // Student Information Box
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, contentWidth, 18, 'FD');

  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  const col1 = margin + 3;
  const col2 = margin + 72;
  const col3 = margin + 132;

  doc.setFont('helvetica', 'bold');
  doc.text('Student Name:', col1, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(card.studentName || '—', col1 + 24, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Gender:', col2, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(card.gender || '—', col2 + 14, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('School Pay Code:', col3, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(card.schoolPayCode || '—', col3 + 28, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Class:', col1, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.text(`${card.classCode}${card.stream ? ` (${card.stream})` : ''}`, col1 + 12, y + 13);

  doc.setFont('helvetica', 'bold');
  doc.text('Term:', col2, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.text(card.termName || card.termId, col2 + 12, y + 13);

  doc.setFont('helvetica', 'bold');
  doc.text('Academic Year:', col3, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.text(card.academicYearName || card.academicYearId, col3 + 25, y + 13);

  y += 22;

  // Subject Assessment Table
  const tableBody = sortReportCardRows(card.subjectResults, subjects).map((row) => [
    row.subjectName,
    row.cumulativeAiScore !== null ? row.cumulativeAiScore.toFixed(1) : 'Pending',
    row.identifier !== null ? String(row.identifier) : '—',
    row.aiDescriptor || '—',
    row.formativeScore !== null ? row.formativeScore.toFixed(1) : '—',
    row.summativeScore !== null ? row.summativeScore.toFixed(1) : 'Pending',
    row.totalScore !== null ? row.totalScore.toFixed(1) : '—',
    row.grade || '—',
    row.descriptor || '—',
    row.teacherInitials || '—',
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [
      [
        'Subject',
        'Cum. AI (0-3)',
        'ID',
        'AI Descriptor',
        'Form. (20%)',
        'Summ. (80%)',
        'Total (100%)',
        'Grade',
        'Descriptor',
        'Tr. Init.',
      ],
    ],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 1.8,
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [15, 39, 68],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.2,
    },
    columnStyles: {
      0: { cellWidth: 36, fontStyle: 'bold' },
      1: { halign: 'right' },
      2: { halign: 'center' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' },
      7: { halign: 'center', fontStyle: 'bold' },
      9: { halign: 'center' },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 5;

  // Performance & Attendance Summary
  const att = card.attendance || { daysPresent: 0, daysAbsent: 0, totalDays: 0 };
  const sum = card.summary;

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, contentWidth, 20, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(15, 39, 68);
  doc.setFont('helvetica', 'bold');
  doc.text('PERFORMANCE & ATTENDANCE SUMMARY', margin + 3, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Days Present: ${att.daysPresent}   |   Days Absent: ${att.daysAbsent}   |   Total Recorded Days: ${att.totalDays}`,
    margin + 3,
    y + 10.5
  );
  doc.text(
    `Avg. Total Score: ${sum?.averageTotalScore !== null && sum?.averageTotalScore !== undefined ? `${sum.averageTotalScore}%` : '—'}   |   Grade Average: ${sum?.averageGrade || '—'}   |   Position: ${sum?.position || '—'}   |   Level: ${sum?.level || '—'}   |   Result: ${sum?.result || '—'}`,
    margin + 3,
    y + 16
  );

  y += 24;

  // Project Scores
  const proj = card.project;
  doc.setFillColor(255, 255, 255);
  doc.rect(margin, y, contentWidth, 18, 'D');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 39, 68);
  doc.text('PROJECT ASSESSMENT', margin + 3, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Subject: ${proj?.subject || 'Art & Design'}   |   Title: ${proj?.title || '—'}   |   Phase: ${proj?.phase || '—'}   |   Score: ${proj?.score !== null && proj?.score !== undefined ? proj.score : '—'}`,
    margin + 3,
    y + 10.5
  );
  doc.text(
    `Remarks: ${proj?.remarks || '—'}   |   Supervisor: ${proj?.supervisorName || '—'}`,
    margin + 3,
    y + 15.5
  );

  y += 22;

  // Comments & Fees
  const fees = card.fees;
  doc.rect(margin, y, contentWidth, 34, 'D');
  doc.setFont('helvetica', 'bold');
  doc.text("Class Teacher's Comment:", margin + 3, y + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.text(sum?.classTeacherComment || '—', margin + 45, y + 5.5);
  doc.text(`Name/Initial: ${sum?.classTeacherName || '—'} (${sum?.classTeacherInitials || '—'})`, margin + 135, y + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.text("Bursar's Comment:", margin + 3, y + 14.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${sum?.bursarComment || fees?.bursarComment || '—'} | Req: ${formatUgx(fees?.feesRequired)} | Bal: ${formatUgx(fees?.balance)}`,
    margin + 35,
    y + 14.5
  );
  doc.text(`Initial: ${sum?.bursarInitials || settings.bursarInitials || '—'}`, margin + 155, y + 14.5);

  doc.setFont('helvetica', 'bold');
  doc.text("Head Teacher's Comment:", margin + 3, y + 23.5);
  doc.setFont('helvetica', 'normal');
  doc.text(sum?.headTeacherComment || '—', margin + 45, y + 23.5);
  doc.text(`Head Teacher: ${sum?.headTeacherName || settings.headTeacherName || '—'}`, margin + 135, y + 23.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Term Dates:', margin + 3, y + 31);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `This Term Has: ${card.thisTermHas || settings.thisTermHas || '—'}   |   Next Term Begins: ${card.nextTermBegins || settings.nextTermBegins || '—'}`,
    margin + 26,
    y + 31
  );

  y += 38;

  // Official Stamp & Validity Notice
  doc.setDrawColor(148, 163, 184);
  doc.rect(margin + contentWidth - 52, y, 52, 22, 'D');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('OFFICIAL SCHOOL STAMP', margin + contentWidth - 26, y + 12, { align: 'center' });

  doc.setTextColor(15, 39, 68);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(
    'NOTICE: This result form is invalid without the official stamp of the Head Teacher or Deputy Head Teacher.',
    margin,
    y + 9,
    { maxWidth: contentWidth - 58 }
  );
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'Overleaf: Grade Scale (A: 80-100, B: 65-79, C: 50-64, D: 35-49, E: 0-34) | AI Identifiers: 1=Basic, 2=Moderate, 3=Outstanding.',
    margin,
    y + 20,
    { maxWidth: contentWidth - 58 }
  );
}

export async function downloadSingleReportCardPdf(
  card: ReportCard,
  settings: SchoolSettings,
  subjects: Subject[] = []
): Promise<void> {
  const logoDataUrl = await getSchoolLogoDataUrl();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  renderReportCardPage(doc, card, settings, true, logoDataUrl, subjects);
  const safeName = card.studentName.replace(/[^a-zA-Z0-9]+/g, '_');
  doc.save(`CSS_ReportCard_${safeName}_${card.classCode}_${card.termName || card.termId}.pdf`);
}

export async function downloadBulkReportCardsPdf(
  cards: ReportCard[],
  settings: SchoolSettings,
  label: string,
  subjects: Subject[] = []
): Promise<void> {
  if (cards.length === 0) return;
  const logoDataUrl = await getSchoolLogoDataUrl();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  cards.forEach((card, index) => {
    renderReportCardPage(doc, card, settings, index === 0, logoDataUrl, subjects);
  });
  const safeLabel = label.replace(/[^a-zA-Z0-9]+/g, '_');
  doc.save(`CSS_Bulk_ReportCards_${safeLabel}.pdf`);
}
