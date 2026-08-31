import type { Report, ReportStatus } from '@/types/admin';
import { fetchReports } from '@/services/adminDataService';

export type ExportFilters = {
  dateRange?: string;
  status?: string;
  category?: string;
};

function parseDateRange(dateRange: string): { from?: Date; to?: Date } {
  const trimmed = dateRange.trim();
  if (!trimmed) return {};

  // Supports "YYYY-MM-DD to YYYY-MM-DD" or single "YYYY-MM-DD"
  const parts = trimmed.split(/\s+to\s+|\s*-\s*|\s+/i).filter(Boolean);
  const from = parts[0] ? new Date(parts[0]) : undefined;
  const to = parts[1] ? new Date(parts[1]) : from;
  if (from && Number.isNaN(from.getTime())) return {};
  if (to && Number.isNaN(to.getTime())) return {};
  if (to) to.setHours(23, 59, 59, 999);
  return { from, to };
}

export function filterReportsForExport(reports: Report[], filters: ExportFilters): Report[] {
  const { from, to } = parseDateRange(filters.dateRange || '');
  return reports.filter((report) => {
    if (filters.status && filters.status !== 'All Statuses' && report.status !== filters.status) {
      return false;
    }
    if (
      filters.category &&
      filters.category !== 'All Categories' &&
      report.category !== filters.category
    ) {
      return false;
    }
    if (from || to) {
      const created = new Date(report.createdAt);
      if (Number.isNaN(created.getTime())) return false;
      if (from && created < from) return false;
      if (to && created > to) return false;
    }
    return true;
  });
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

export function reportsToPrintableHtml(reports: Report[], title = 'EcoBantay Environmental Reports'): string {
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
  <p>Generated ${new Date().toLocaleString()} · ${reports.length} report(s)</p>
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

export async function exportFilteredReports(input: {
  filters: ExportFilters;
  format: string;
  fileName?: string;
  openAfterSaving?: boolean;
}): Promise<{ count: number; format: string }> {
  const all = await fetchReports();
  const filtered = filterReportsForExport(all, input.filters);
  const baseName = (input.fileName || `ecobantay-reports-${Date.now()}`).replace(/\.[^.]+$/, '');

  if (input.format === 'csv' || input.format === 'excel') {
    const content = reportsToCsv(filtered);
    downloadBrowserFile(`${baseName}.csv`, content, 'text/csv;charset=utf-8');
  } else if (input.format === 'json') {
    downloadBrowserFile(`${baseName}.json`, reportsToJson(filtered), 'application/json');
  } else if (input.format === 'pdf' || input.format === 'word') {
    const html = reportsToPrintableHtml(filtered);
    if (typeof window !== 'undefined') {
      const printWindow = window.open('', '_blank');
      if (!printWindow) throw new Error('Pop-up blocked. Allow pop-ups to print/export PDF.');
      printWindow.document.write(html);
      printWindow.document.close();
      if (input.openAfterSaving !== false) {
        setTimeout(() => printWindow.print(), 300);
      }
    }
  } else {
    throw new Error(`Unsupported export format: ${input.format}`);
  }

  return { count: filtered.length, format: input.format };
}

export type { ReportStatus };
