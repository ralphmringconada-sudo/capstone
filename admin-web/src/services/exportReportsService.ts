import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { getBlob, getBytes, ref as storageRef } from 'firebase/storage';
import JSZip from 'jszip';
import { auth, db, storage } from '@/config/firebase';
import { firebaseConfig } from '@/config/firebaseConfig';
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


/** Collect every image reference from both schema generations (URLs and storage paths). */
export function getReportImageRefs(report: Report): string[] {
  const refs = [...(report.images || []), ...(report.imagePaths || [])]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return Array.from(new Set(refs));
}


/** HTTP(S) URLs only — used in CSV/JSON columns. */
export function getReportImageUrls(report: Report): string[] {
  return getReportImageRefs(report).filter((value) => /^https?:\/\//i.test(value));
}


function storagePathFromRef(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^\/+/, '');
  }


  try {
    const parsed = new URL(trimmed);
    // https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encodedPath>?alt=media&token=...
    const objectMatch = parsed.pathname.match(/\/o\/(.+)$/);
    if (objectMatch?.[1]) {
      return decodeURIComponent(objectMatch[1]);
    }
    // https://<bucket>.storage.googleapis.com/<path>
    if (parsed.hostname.endsWith('.storage.googleapis.com')) {
      return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    }
  } catch {
    return null;
  }
  return null;
}


function storageBucketsToTry(): string[] {
  const configured = firebaseConfig.storageBucket || '';
  const projectId = firebaseConfig.projectId || '';
  return Array.from(
    new Set(
      [
        configured,
        configured && !configured.includes('.') ? `${configured}.appspot.com` : '',
        configured && !configured.includes('.') ? `${configured}.firebasestorage.app` : '',
        projectId ? `${projectId}.appspot.com` : '',
        projectId ? `${projectId}.firebasestorage.app` : '',
      ].filter(Boolean),
    ),
  );
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


function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
    'imageCount',
    'imageUrls',
  ];
  const rows = reports.map((report) => {
    const imageUrls = getReportImageUrls(report);
    return [
      report.id,
      report.title,
      report.category,
      report.status,
      report.location,
      report.reportedByName,
      report.reportedByEmail || '',
      report.createdAt,
      report.description,
      imageUrls.length,
      imageUrls.join(' | '),
    ]
      .map(escapeCsv)
      .join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}


export function reportsToJson(reports: Report[]): string {
  const payload = reports.map((report) => ({
    ...report,
    imageUrls: getReportImageUrls(report),
  }));
  return JSON.stringify(payload, null, 2);
}


type FetchedImage = {
  reportId: string;
  index: number;
  url: string;
  blob: Blob | null;
  dataUrl: string | null;
  fileName: string;
};


function extensionFromContentType(contentType: string, fallbackUrl: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  const match = fallbackUrl.match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i);
  return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}


async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });
}


async function downloadViaProxy(imageUrl: string): Promise<Blob | null> {
  if (typeof window === 'undefined' || !/^https?:\/\//i.test(imageUrl)) return null;
  try {
    const proxyUrl = `/api/report-image?url=${encodeURIComponent(imageUrl)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.size) return null;
    return blob;
  } catch {
    return null;
  }
}


function buildMediaUrls(path: string): string[] {
  return storageBucketsToTry().map(
    (bucket) =>
      `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/` +
      `${encodeURIComponent(path)}?alt=media`,
  );
}


async function downloadImageBlob(imageRef: string): Promise<Blob> {
  const path = storagePathFromRef(imageRef);
  const errors: string[] = [];
  const candidateUrls = [
    ...(/^https?:\/\//i.test(imageRef) ? [imageRef] : []),
    ...(path ? buildMediaUrls(path) : []),
  ];


  // 1) Same-origin Vercel proxy — bypasses Storage CORS in production.
  for (const url of candidateUrls) {
    const proxied = await downloadViaProxy(url);
    if (proxied) return proxied;
    errors.push(`proxy:${url.slice(0, 64)}`);
  }


  // 2) Firebase SDK (signed-in admin session).
  if (path) {
    for (const bucket of storageBucketsToTry()) {
      try {
        const objectRef = storageRef(storage, `gs://${bucket}/${path}`);
        try {
          return await getBlob(objectRef);
        } catch {
          const bytes = await getBytes(objectRef);
          return new Blob([bytes], { type: 'image/jpeg' });
        }
      } catch (error) {
        errors.push(`sdk:${bucket}:${error instanceof Error ? error.message : String(error)}`);
      }
    }


    try {
      const objectRef = storageRef(storage, path);
      try {
        return await getBlob(objectRef);
      } catch {
        const bytes = await getBytes(objectRef);
        return new Blob([bytes], { type: 'image/jpeg' });
      }
    } catch (error) {
      errors.push(`sdk:default:${error instanceof Error ? error.message : String(error)}`);
    }
  }


  // 3) Authenticated / direct browser fetch (works after CORS is configured).
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  for (const url of candidateUrls) {
    try {
      const response = await fetch(url, {
        headers: token ? { Authorization: `Firebase ${token}` } : undefined,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.blob();
    } catch (error) {
      errors.push(`fetch:${error instanceof Error ? error.message : String(error)}`);
    }
  }


  throw new Error(errors.slice(0, 6).join(' | ') || 'Unable to download image');
}


async function fetchReportImages(reports: Report[]): Promise<FetchedImage[]> {
  const jobs: Array<Promise<FetchedImage>> = [];


  for (const report of reports) {
    const refs = getReportImageRefs(report);
    refs.forEach((imageRef, index) => {
      jobs.push(
        (async () => {
          try {
            const blob = await downloadImageBlob(imageRef);
            const ext = extensionFromContentType(blob.type || '', imageRef);
            const dataUrl = await blobToDataUrl(blob);
            return {
              reportId: report.id,
              index,
              url: imageRef,
              blob,
              dataUrl,
              fileName: `${String(index + 1).padStart(2, '0')}.${ext}`,
            };
          } catch {
            return {
              reportId: report.id,
              index,
              url: imageRef,
              blob: null,
              dataUrl: null,
              fileName: `${String(index + 1).padStart(2, '0')}.jpg`,
            };
          }
        })(),
      );
    });
  }


  return Promise.all(jobs);
}


export function reportsToPrintableHtml(
  reports: Report[],
  title = 'EcoBantay Environmental Reports',
  rangeLabel = 'All dates',
  fetchedImages: FetchedImage[] = [],
): string {
  const imagesByReport = new Map<string, FetchedImage[]>();
  for (const image of fetchedImages) {
    const list = imagesByReport.get(image.reportId) || [];
    list.push(image);
    imagesByReport.set(image.reportId, list);
  }


  const cards = reports
    .map((report) => {
      const images = (imagesByReport.get(report.id) || []).sort((a, b) => a.index - b.index);
      const imageHtml = images.length
        ? `<div class="images">${images
            .map((image) => {
              const src = image.dataUrl || image.url;
              return `<figure><img src="${escapeHtml(src)}" alt="Report evidence" /><figcaption>${escapeHtml(image.fileName)}</figcaption></figure>`;
            })
            .join('')}</div>`
        : '<p class="muted">No images attached.</p>';


      return `
      <article class="card">
        <h2>${escapeHtml(report.title || 'Untitled report')}</h2>
        <p><strong>Category:</strong> ${escapeHtml(report.category || '')}</p>
        <p><strong>Status:</strong> ${escapeHtml(report.status || '')}</p>
        <p><strong>Location:</strong> ${escapeHtml(report.location || '')}</p>
        <p><strong>Reporter:</strong> ${escapeHtml(report.reportedByName || '')}</p>
        <p><strong>Created:</strong> ${escapeHtml(report.createdAt ? new Date(report.createdAt).toLocaleString() : '')}</p>
        <p><strong>Description:</strong> ${escapeHtml(report.description || '')}</p>
        <h3>Evidence photos</h3>
        ${imageHtml}
      </article>`;
    })
    .join('');


  const summaryRows = reports
    .map(
      (report) => `
      <tr>
        <td>${escapeHtml(report.title || '')}</td>
        <td>${escapeHtml(report.category || '')}</td>
        <td>${escapeHtml(report.status || '')}</td>
        <td>${escapeHtml(report.location || '')}</td>
        <td>${escapeHtml(report.reportedByName || '')}</td>
        <td>${escapeHtml(report.createdAt ? new Date(report.createdAt).toLocaleString() : '')}</td>
        <td>${getReportImageUrls(report).length}</td>
      </tr>`,
    )
    .join('');


  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
    h1 { color: #0B5A1E; }
    h2 { color: #145C1E; margin-bottom: 8px; }
    h3 { margin-top: 16px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0 28px; }
    th, td { border: 1px solid #ccc; padding: 8px; font-size: 12px; text-align: left; }
    th { background: #E1F0B9; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 20px; page-break-inside: avoid; }
    .images { display: flex; flex-wrap: wrap; gap: 12px; }
    figure { margin: 0; width: 220px; }
    img { width: 100%; height: 160px; object-fit: cover; border-radius: 6px; border: 1px solid #ccc; background: #f5f5f5; }
    figcaption { font-size: 11px; color: #555; margin-top: 4px; }
    .muted { color: #666; font-size: 13px; }
    @media print { button { display: none; } img { max-height: 180px; } }
  </style>
</head>
<body>
  <button onclick="window.print()">Print / Save as PDF</button>
  <h1>${escapeHtml(title)}</h1>
  <p>Generated ${escapeHtml(new Date().toLocaleString())} · Range: ${escapeHtml(rangeLabel)} · ${reports.length} report(s)</p>
  <table>
    <thead>
      <tr>
        <th>Title</th><th>Category</th><th>Status</th><th>Location</th><th>Reporter</th><th>Created</th><th>Images</th>
      </tr>
    </thead>
    <tbody>${summaryRows || '<tr><td colspan="7">No reports matched the selected filters.</td></tr>'}</tbody>
  </table>
  ${cards}
</body>
</html>`;
}


function downloadBrowserFile(filename: string, content: Blob | string, mime?: string) {
  if (typeof document === 'undefined') {
    throw new Error('File download is only available in the browser.');
  }
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'application/octet-stream' });
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


async function buildBackupZip(
  reports: Report[],
  fetchedImages: FetchedImage[],
  format: string,
  baseName: string,
  label: string,
): Promise<{ blob: Blob; packed: number; missing: number }> {
  const zip = new JSZip();
  const folder = zip.folder(baseName) || zip;


  if (format === 'csv' || format === 'excel') {
    folder.file(`${baseName}.csv`, reportsToCsv(reports));
  } else if (format === 'json') {
    folder.file(`${baseName}.json`, reportsToJson(reports));
  }


  const html = reportsToPrintableHtml(reports, 'EcoBantay Environmental Reports', label, fetchedImages);
  folder.file(`${baseName}.html`, html);


  const imagesRoot = folder.folder('images');
  let packed = 0;
  const missingLines: string[] = [];


  for (const image of fetchedImages) {
    if (image.blob && imagesRoot) {
      const reportFolder = imagesRoot.folder(image.reportId);
      reportFolder?.file(image.fileName, image.blob);
      packed += 1;
    } else {
      missingLines.push(`${image.reportId}/${image.fileName} :: ${image.url}`);
    }
  }


  // Always keep a plain list of image links so backups remain useful if binary pack fails.
  folder.file(
    'image-urls.txt',
    reports
      .map((report) => {
        const refs = getReportImageRefs(report);
        if (!refs.length) return `${report.id}: (no images)`;
        return [`${report.id}:`, ...refs.map((refValue) => `  - ${refValue}`)].join('\n');
      })
      .join('\n\n'),
  );


  if (missingLines.length) {
    folder.file(
      'images-missing.txt',
      [
        'These image files could not be downloaded into the ZIP.',
        'Open image-urls.txt and download them manually, or re-export after Storage CORS is configured.',
        '',
        ...missingLines,
      ].join('\n'),
    );
  }


  folder.file(
    'README.txt',
    [
      'EcoBantay report backup',
      `Generated: ${new Date().toISOString()}`,
      `Range: ${label}`,
      `Reports: ${reports.length}`,
      `Images packed: ${packed}`,
      `Images missing: ${missingLines.length}`,
      '',
      'Open the .html file to view reports with photos.',
      'Image files are under images/<reportId>/ when packing succeeds.',
      'If images/ is empty, see images-missing.txt and image-urls.txt.',
    ].join('\n'),
  );


  return {
    blob: await zip.generateAsync({ type: 'blob' }),
    packed,
    missing: missingLines.length,
  };
}


export async function exportFilteredReports(input: {
  filters: ExportFilters;
  format: string;
  fileName?: string;
  openAfterSaving?: boolean;
}): Promise<{ count: number; format: string; imageCount: number; imagesMissing: number }> {
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


  const fetchedImages = await fetchReportImages(filtered);
  const html = reportsToPrintableHtml(filtered, 'EcoBantay Environmental Reports', label, fetchedImages);


  const zipResult = await buildBackupZip(filtered, fetchedImages, input.format, baseName, label);
  downloadBrowserFile(`${baseName}.zip`, zipResult.blob, 'application/zip');


  // Keep a direct HTML download for PDF/Word so Print still works even if ZIP is ignored.
  if (input.format === 'pdf' || input.format === 'word') {
    downloadBrowserFile(`${baseName}.html`, html, 'text/html;charset=utf-8');
    if (typeof window !== 'undefined' && input.openAfterSaving !== false) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 350);
      }
    }
  } else if (input.format === 'csv' || input.format === 'excel') {
    downloadBrowserFile(`${baseName}.csv`, reportsToCsv(filtered), 'text/csv;charset=utf-8');
  } else if (input.format === 'json') {
    downloadBrowserFile(`${baseName}.json`, reportsToJson(filtered), 'application/json');
  } else {
    throw new Error(`Unsupported export format: ${input.format}`);
  }


  return {
    count: filtered.length,
    format: input.format,
    imageCount: zipResult.packed,
    imagesMissing: zipResult.missing,
  };
}



