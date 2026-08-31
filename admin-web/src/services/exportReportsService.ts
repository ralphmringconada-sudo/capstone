import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { Report } from '@/types/admin';
import { isWithinDateRange } from '@/utils/dateRange';

export type ExportFilters = {
  fromDate?: string;
  toDate?: string;
  dateRange?: string;
  status?: string;
  category?: string;
};

export type ExportSummary = {
  total: number;
  inReview: number;
  pending: number;
  resolved: number;
  rejected: number;
};

async function loadAllReports(): Promise<Report[]> {
  const mapDoc = (item: { id: string; data: () => Record<string, unknown> }): Report => {
    const data = item.data();
    const rawCreated = data.createdAt as string | { toDate?: () => Date } | undefined;
    let createdAt = '';
    if (typeof rawCreated === 'string') {
      createdAt = rawCreated;
    } else if (rawCreated && typeof rawCreated.toDate === 'function') {
      createdAt = rawCreated.toDate().toISOString();
    }
    return {
      id: item.id,
      ...(data as Omit<Report, 'id' | 'createdAt'>),
      createdAt,
    };
  };

  try {
    const snapshot = await getDocs(query(collection(db, 'reports'), orderBy('createdAt', 'desc')));
    return snapshot.docs.map((item) => mapDoc(item));
  } catch {
    const snapshot = await getDocs(collection(db, 'reports'));
    return snapshot.docs
      .map((item) => mapDoc(item))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
}

function legacyDateRangeToBounds(dateRange: string): { fromDate: string; toDate: string } {
  const trimmed = dateRange.trim();
  if (!trimmed) return { fromDate: '', toDate: '' };
  const parts = trimmed.split(/\s+to\s+/i).filter(Boolean);
  if (parts.length >= 2) {
    return { fromDate: parts[0].trim(), toDate: parts[1].trim() };
  }
  const dashParts = trimmed.split(/\s*-\s*/).filter(Boolean);
  if (dashParts.length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(dashParts[0])) {
    return { fromDate: dashParts[0], toDate: dashParts[1] };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { fromDate: trimmed, toDate: trimmed };
  }
  return { fromDate: '', toDate: '' };
}

function normalizeCategory(value: string): string {
  return value.trim().toLowerCase();
}

function matchesCategory(reportCategory: string, selected: string): boolean {
  if (!selected || selected === 'All Categories') return true;
  const report = normalizeCategory(reportCategory || '');
  const wanted = normalizeCategory(selected);

  if (report === wanted) return true;

  // Tolerate naming differences between mobile app and export dropdown.
  const aliases: Record<string, string[]> = {
    'waste dumping': ['waste dumping', 'waste management', 'illegal dumping'],
    'illegal dumping': ['illegal dumping', 'waste dumping', 'waste management'],
    'waste management': ['waste management', 'waste dumping', 'illegal dumping'],
    'air pollution': ['air pollution'],
    'water pollution': ['water pollution'],
    deforestation: ['deforestation'],
    'forest fires': ['forest fires'],
    'illegal logging': ['illegal logging'],
    other: ['other'],
  };

  const group = aliases[wanted] || [wanted];
  return group.some((alias) => report === alias || report.includes(alias));
}

export function filterReportsForExport(reports: Report[], filters: ExportFilters): Report[] {
  let fromDate = filters.fromDate || '';
  let toDate = filters.toDate || '';
  if ((!fromDate && !toDate) && filters.dateRange) {
    const legacy = legacyDateRangeToBounds(filters.dateRange);
    fromDate = legacy.fromDate;
    toDate = legacy.toDate;
  }

  return reports.filter((report) => {
    if (filters.status && filters.status !== 'All Statuses' && report.status !== filters.status) {
      return false;
    }
    if (!matchesCategory(report.category || '', filters.category || 'All Categories')) {
      return false;
    }
    return isWithinDateRange(report.createdAt, fromDate, toDate);
  });
}

export function summarizeReports(reports: Report[]): ExportSummary {
  return {
    total: reports.length,
    inReview: reports.filter((item) => item.status === 'In Review').length,
    pending: reports.filter((item) => item.status === 'Pending').length,
    resolved: reports.filter((item) => item.status === 'Resolved').length,
    rejected: reports.filter((item) => item.status === 'Rejected').length,
  };
}

export async function previewExportFilters(filters: ExportFilters): Promise<{
  reports: Report[];
  summary: ExportSummary;
}> {
  const all = await loadAllReports();
  const reports = filterReportsForExport(all, filters);
  return { reports, summary: summarizeReports(reports) };
}

function escapeCsv(value: unknown): string {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function reportsToCsv(reports: Report[]): string {
  const headers = [
    'id',
    'title',
    'category',
    'status',
    'location',
    'reportedByName',
    'reportedByEmail',
    'createdAt',
    'description',
  ];
  const rows = reports.map((report) =>
    [
      report.id,
      report.title,
      report.category,
      report.status,
      report.location,
      report.reportedByName,
      report.reportedByEmail || '',
      report.createdAt,
      report.description,
    ]
      .map(escapeCsv)
      .join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

export function reportsToJson(reports: Report[]): string {
  return JSON.stringify(reports, null, 2);
}

export function reportsToPrintableHtml(
  reports: Report[],
  title = 'EcoBantay Environmental Reports',
  rangeLabel = 'All dates',
): string {
  const rows = reports
    .map(
      (report) => `
      <tr>
        <td>${report.title || ''}</td>
        <td>${report.category || ''}</td>
        <td>${report.status || ''}</td>
        <td>${report.location || ''}</td>
        <td>${report.reportedByName || ''}</td>
        <td>${new Date(report.createdAt).toLocaleString()}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
    h1 { color: #0B5A1E; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #ccc; padding: 8px; font-size: 12px; text-align: left; }
    th { background: #E1F0B9; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <button onclick="window.print()">Print / Save as PDF</button>
  <h1>${title}</h1>
  <p>Generated ${new Date().toLocaleString()} · Range: ${rangeLabel} · ${reports.length} report(s)</p>
  <table>
    <thead>
      <tr>
        <th>Title</th><th>Category</th><th>Status</th><th>Location</th><th>Reporter</th><th>Created</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="6">No reports matched the selected filters.</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

function downloadBrowserFile(filename: string, content: string, mime: string) {
  if (typeof document === 'undefined') {
    throw new Error('File download is only available in the browser.');
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function rangeLabel(filters: ExportFilters): string {
  const from = filters.fromDate || '';
  const to = filters.toDate || '';
  if (!from && !to) return 'All dates';
  if (from && to) return `${from} to ${to}`;
  if (from) return `From ${from}`;
  return `Until ${to}`;
}

export async function exportFilteredReports(input: {
  filters: ExportFilters;
  format: string;
  fileName?: string;
  openAfterSaving?: boolean;
}): Promise<{ count: number; format: string }> {
  const all = await loadAllReports();
  const filtered = filterReportsForExport(all, input.filters);
  const baseName = (input.fileName || `ecobantay-reports-${Date.now()}`).replace(/\.[^.]+$/, '');
  const label = rangeLabel(input.filters);

  if (!filtered.length) {
    throw new Error(
      `No reports found for ${label}` +
        (input.filters.status && input.filters.status !== 'All Statuses'
          ? `, status "${input.filters.status}"`
          : '') +
        (input.filters.category && input.filters.category !== 'All Categories'
          ? `, category "${input.filters.category}"`
          : '') +
        '. Adjust filters and try again.',
    );
  }

  if (input.format === 'csv' || input.format === 'excel') {
    downloadBrowserFile(`${baseName}.csv`, reportsToCsv(filtered), 'text/csv;charset=utf-8');
  } else if (input.format === 'json') {
    downloadBrowserFile(`${baseName}.json`, reportsToJson(filtered), 'application/json');
  } else if (input.format === 'pdf' || input.format === 'word') {
    // Always download an HTML backup so export still works if pop-ups are blocked.
    const html = reportsToPrintableHtml(filtered, 'EcoBantay Environmental Reports', label);
    downloadBrowserFile(`${baseName}.html`, html, 'text/html;charset=utf-8');
    if (typeof window !== 'undefined' && input.openAfterSaving !== false) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 350);
      }
    }
  } else {
    throw new Error(`Unsupported export format: ${input.format}`);
  }

  return { count: filtered.length, format: input.format };
}
