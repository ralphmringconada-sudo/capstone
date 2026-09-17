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


function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}


function formatExportDateTime(value?: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}


function statusClassName(status: string): string {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'pending') return 'pending';
  if (normalized === 'in review') return 'review';
  if (normalized === 'resolved') return 'resolved';
  if (normalized === 'rejected') return 'rejected';
  return 'neutral';
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

  const summary = summarizeReports(reports);

  const summaryRows = reports
    .map(
      (report) => `
      <tr>
        <td class="report-id">#${escapeHtml(report.id.slice(0, 8).toUpperCase())}</td>
        <td>
          <strong>${escapeHtml(report.title || 'Untitled report')}</strong>
          <div class="subtext">${escapeHtml(report.description || '')}</div>
        </td>
        <td>${escapeHtml(report.category || '')}</td>
        <td><span class="status ${statusClassName(report.status || '')}">${escapeHtml(report.status || '')}</span></td>
        <td>${escapeHtml(report.location || '')}</td>
        <td>${escapeHtml(report.reportedByName || '')}</td>
        <td>${escapeHtml(formatExportDateTime(report.createdAt))}</td>
      </tr>`,
    )
    .join('');

  const cards = reports
    .map((report, index) => {
      const images = (imagesByReport.get(report.id) || []).sort(
        (a, b) => a.index - b.index,
      );

      const imageHtml = images.length
        ? `<div class="images">${images
            .map((image) => {
              const src = image.dataUrl || image.url;
              return `
                <figure>
                  <img src="${escapeHtml(src)}" alt="Report evidence" />
                  <figcaption>Evidence ${image.index + 1}</figcaption>
                </figure>`;
            })
            .join('')}</div>`
        : '<div class="empty-evidence">No evidence photos attached.</div>';

      return `
      <article class="report-card">
        <div class="report-card-heading">
          <div>
            <div class="eyebrow">REPORT ${String(index + 1).padStart(2, '0')}</div>
            <h2>${escapeHtml(report.title || 'Untitled report')}</h2>
            <div class="report-id">#${escapeHtml(report.id.slice(0, 10).toUpperCase())}</div>
          </div>
          <span class="status large ${statusClassName(report.status || '')}">
            ${escapeHtml(report.status || '')}
          </span>
        </div>

        <div class="detail-grid">
          <div class="detail-item">
            <span>Category</span>
            <strong>${escapeHtml(report.category || 'Not specified')}</strong>
          </div>
          <div class="detail-item">
            <span>Date Reported</span>
            <strong>${escapeHtml(formatExportDateTime(report.createdAt) || 'Not recorded')}</strong>
          </div>
          <div class="detail-item wide">
            <span>Location</span>
            <strong>${escapeHtml(report.location || 'Not specified')}</strong>
          </div>
          <div class="detail-item">
            <span>Reported By</span>
            <strong>${escapeHtml(report.reportedByName || 'Unknown')}</strong>
          </div>
          <div class="detail-item">
            <span>Email</span>
            <strong>${escapeHtml(report.reportedByEmail || 'Not provided')}</strong>
          </div>
        </div>

        <div class="description-box">
          <span>Description</span>
          <p>${escapeHtml(report.description || 'No description provided.')}</p>
        </div>

        <div class="evidence-heading">
          <h3>Evidence Photos</h3>
          <span>${images.length} attached</span>
        </div>
        ${imageHtml}
      </article>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: A4;
      margin: 13mm;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: #F3F6F2;
      color: #1F2A20;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .document {
      max-width: 1100px;
      margin: 0 auto;
      background: #FFFFFF;
    }

    .hero {
      position: relative;
      overflow: hidden;
      padding: 30px 34px 28px;
      color: #FFFFFF;
      background:
        linear-gradient(135deg, #0B5A1E 0%, #176D2A 55%, #2D8738 100%);
      border-radius: 0 0 22px 22px;
    }

    .hero::after {
      content: "";
      position: absolute;
      width: 210px;
      height: 210px;
      border-radius: 50%;
      right: -70px;
      top: -105px;
      background: rgba(255,255,255,0.08);
    }

    .brand {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      opacity: 0.88;
    }

    h1 {
      margin: 7px 0 4px;
      font-size: 28px;
      line-height: 1.15;
    }

    .hero-subtitle {
      margin: 0;
      font-size: 13px;
      opacity: 0.88;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      padding: 18px 28px 4px;
    }

    .meta-card {
      border: 1px solid #DDE5DA;
      background: #F8FAF7;
      border-radius: 10px;
      padding: 11px 13px;
    }

    .meta-card span,
    .detail-item span,
    .description-box span {
      display: block;
      margin-bottom: 4px;
      color: #718071;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.7px;
      text-transform: uppercase;
    }

    .meta-card strong {
      display: block;
      color: #17391D;
      font-size: 12px;
    }

    .section {
      padding: 22px 28px 0;
    }

    .section-title-row {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 12px;
    }

    .section-title-row h2 {
      margin: 0;
      color: #145C1E;
      font-size: 17px;
    }

    .section-note {
      color: #7A857A;
      font-size: 10px;
    }

    .summary-cards {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
    }

    .summary-card {
      min-height: 78px;
      border: 1px solid #DCE3D9;
      border-radius: 10px;
      padding: 12px;
      background: #FFFFFF;
    }

    .summary-card .label {
      color: #657165;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }

    .summary-card .value {
      margin-top: 5px;
      font-size: 26px;
      line-height: 1;
      font-weight: 800;
      color: #172018;
    }

    .summary-card.total { background: #E7F2E1; }
    .summary-card.review { background: #E4F1FC; }
    .summary-card.pending { background: #FFF5D9; }
    .summary-card.resolved { background: #E2F3E4; }
    .summary-card.rejected { background: #FCE5E5; }

    .table-wrap {
      overflow: hidden;
      border: 1px solid #D9E0D6;
      border-radius: 10px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    thead th {
      padding: 9px 8px;
      background: #174F22;
      color: #FFFFFF;
      font-size: 9px;
      line-height: 1.2;
      text-align: left;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    tbody td {
      padding: 9px 8px;
      border-top: 1px solid #E5EAE3;
      color: #2B332B;
      font-size: 9px;
      line-height: 1.35;
      vertical-align: top;
      word-break: break-word;
    }

    tbody tr:nth-child(even) td {
      background: #FAFBF9;
    }

    .subtext {
      margin-top: 3px;
      color: #7B827B;
      font-size: 8px;
      line-height: 1.3;
    }

    .report-id {
      color: #6D776D;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.25px;
    }

    .status {
      display: inline-block;
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 8px;
      font-weight: 700;
      white-space: nowrap;
    }

    .status.large {
      padding: 6px 11px;
      font-size: 9px;
    }

    .status.pending { color: #936400; background: #FFF0B8; }
    .status.review { color: #315BC9; background: #D9E8FF; }
    .status.resolved { color: #168A18; background: #D8F0DA; }
    .status.rejected { color: #C52E2E; background: #FFDCDC; }
    .status.neutral { color: #4F5B4F; background: #E9EEE8; }

    .report-card {
      margin: 0 28px 20px;
      border: 1px solid #D9E1D7;
      border-radius: 12px;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
      background: #FFFFFF;
    }

    .report-card-heading {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 18px;
      padding: 16px 18px;
      background: #F6FAF4;
      border-bottom: 1px solid #E1E7DF;
    }

    .report-card-heading h2 {
      margin: 3px 0 4px;
      color: #143E1C;
      font-size: 16px;
      line-height: 1.25;
    }

    .eyebrow {
      color: #4A8C50;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 1.2px;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      padding: 16px 18px 0;
    }

    .detail-item {
      min-height: 54px;
      padding: 10px 11px;
      border-radius: 8px;
      background: #F8FAF7;
      border: 1px solid #E4E9E2;
    }

    .detail-item.wide {
      grid-column: span 2;
    }

    .detail-item strong {
      color: #293329;
      font-size: 10px;
      line-height: 1.35;
    }

    .description-box {
      margin: 12px 18px 0;
      padding: 12px;
      background: #FBFCFA;
      border-left: 3px solid #4A9852;
      border-radius: 4px 8px 8px 4px;
    }

    .description-box p {
      margin: 0;
      color: #414A41;
      font-size: 10px;
      line-height: 1.55;
    }

    .evidence-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 18px 8px;
    }

    .evidence-heading h3 {
      margin: 0;
      color: #145C1E;
      font-size: 12px;
    }

    .evidence-heading span {
      color: #7A847A;
      font-size: 9px;
    }

    .images {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      padding: 0 18px 18px;
    }

    figure {
      margin: 0;
      overflow: hidden;
      border: 1px solid #DFE5DD;
      border-radius: 8px;
      background: #F6F8F5;
    }

    figure img {
      display: block;
      width: 100%;
      height: 145px;
      object-fit: cover;
      background: #EEF1ED;
    }

    figcaption {
      padding: 6px 8px;
      color: #6D776D;
      font-size: 8px;
    }

    .empty-evidence {
      margin: 0 18px 18px;
      padding: 14px;
      border-radius: 8px;
      color: #7A837A;
      background: #F5F7F4;
      font-size: 9px;
      text-align: center;
    }

    .footer {
      margin: 8px 28px 0;
      padding: 14px 0 24px;
      border-top: 1px solid #DDE3DB;
      color: #7A847A;
      font-size: 8px;
      text-align: center;
    }

    @media print {
      body { background: #FFFFFF; }
      .document { max-width: none; }
      .hero { border-radius: 0; }
      .report-card { page-break-inside: avoid; }
      figure img { max-height: 145px; }
    }
  </style>
</head>
<body>
  <div class="document">
    <header class="hero">
      <div class="brand">EcoBantay</div>
      <h1>${escapeHtml(title)}</h1>
      <p class="hero-subtitle">Environmental monitoring and community reporting export</p>
    </header>

    <div class="meta-grid">
      <div class="meta-card">
        <span>Generated</span>
        <strong>${escapeHtml(new Date().toLocaleString())}</strong>
      </div>
      <div class="meta-card">
        <span>Date Range</span>
        <strong>${escapeHtml(rangeLabel)}</strong>
      </div>
      <div class="meta-card">
        <span>Matched Reports</span>
        <strong>${reports.length}</strong>
      </div>
    </div>

    <section class="section">
      <div class="section-title-row">
        <h2>Export Summary</h2>
        <div class="section-note">Counts reflect the selected filters</div>
      </div>

      <div class="summary-cards">
        <div class="summary-card total">
          <div class="label">Total</div>
          <div class="value">${summary.total}</div>
        </div>
        <div class="summary-card review">
          <div class="label">In Review</div>
          <div class="value">${summary.inReview}</div>
        </div>
        <div class="summary-card pending">
          <div class="label">Pending</div>
          <div class="value">${summary.pending}</div>
        </div>
        <div class="summary-card resolved">
          <div class="label">Resolved</div>
          <div class="value">${summary.resolved}</div>
        </div>
        <div class="summary-card rejected">
          <div class="label">Rejected</div>
          <div class="value">${summary.rejected}</div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-title-row">
        <h2>Report Overview</h2>
        <div class="section-note">${reports.length} report(s)</div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:9%">ID</th>
              <th style="width:20%">Report</th>
              <th style="width:12%">Category</th>
              <th style="width:10%">Status</th>
              <th style="width:20%">Location</th>
              <th style="width:13%">Reporter</th>
              <th style="width:16%">Date Reported</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows || '<tr><td colspan="7">No reports matched the selected filters.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <div class="section-title-row">
        <h2>Report Details</h2>
        <div class="section-note">Evidence is shown when available</div>
      </div>
    </section>

    ${cards || '<div class="empty-evidence">No reports matched the selected filters.</div>'}

    <footer class="footer">
      EcoBantay · Environmental Report Export · Generated ${escapeHtml(new Date().toLocaleString())}
    </footer>
  </div>
</body>
</html>`;
}


/* ------------------------------------------------------------------
 * STYLED XLSX EXPORT
 * ------------------------------------------------------------------ */

function xlsxColumnName(index: number): string {
  let value = index;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}


function xlsxInlineCell(
  column: number,
  row: number,
  value: unknown,
  style = 0,
): string {
  const ref = `${xlsxColumnName(column)}${row}`;
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escapeXml(
    value,
  )}</t></is></c>`;
}


function xlsxStatusStyle(status: string): number {
  if (status === 'Pending') return 10;
  if (status === 'In Review') return 11;
  if (status === 'Resolved') return 12;
  if (status === 'Rejected') return 13;
  return 14;
}


function xlsxStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="10"/><name val="Aptos"/></font>
    <font><b/><sz val="10"/><name val="Aptos"/></font>
    <font><b/><sz val="20"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>
  </fonts>

  <fills count="9">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF145C1E"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE7F2E1"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE4F1FC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF5D9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2F3E4"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFCE5E5"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF4F6F3"/><bgColor indexed="64"/></patternFill></fill>
  </fills>

  <borders count="2">
    <border/>
    <border>
      <left style="thin"><color rgb="FFD9E0D6"/></left>
      <right style="thin"><color rgb="FFD9E0D6"/></right>
      <top style="thin"><color rgb="FFD9E0D6"/></top>
      <bottom style="thin"><color rgb="FFD9E0D6"/></bottom>
      <diagonal/>
    </border>
  </borders>

  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>

  <cellXfs count="15">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="6" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="7" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="6" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="7" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="8" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>

  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;
}


function xlsxSummarySheetXml(
  summary: ExportSummary,
  label: string,
  generatedAt: string,
): string {
  const rows = [
    `<row r="1" ht="30" customHeight="1">${xlsxInlineCell(
      1,
      1,
      'EcoBantay Environmental Reports',
      1,
    )}</row>`,
    `<row r="2">${xlsxInlineCell(
      1,
      2,
      `Generated: ${generatedAt}`,
      2,
    )}</row>`,
    `<row r="3">${xlsxInlineCell(
      1,
      3,
      `Date Range: ${label}`,
      2,
    )}</row>`,
    `<row r="5" ht="24" customHeight="1">${xlsxInlineCell(
      1,
      5,
      'Total Reports',
      5,
    )}${xlsxInlineCell(3, 5, 'In Review', 6)}${xlsxInlineCell(
      5,
      5,
      'Pending',
      7,
    )}</row>`,
    `<row r="6" ht="30" customHeight="1">${xlsxInlineCell(
      1,
      6,
      summary.total,
      5,
    )}${xlsxInlineCell(3, 6, summary.inReview, 6)}${xlsxInlineCell(
      5,
      6,
      summary.pending,
      7,
    )}</row>`,
    `<row r="8" ht="24" customHeight="1">${xlsxInlineCell(
      1,
      8,
      'Resolved',
      8,
    )}${xlsxInlineCell(3, 8, 'Rejected', 9)}</row>`,
    `<row r="9" ht="30" customHeight="1">${xlsxInlineCell(
      1,
      9,
      summary.resolved,
      8,
    )}${xlsxInlineCell(3, 9, summary.rejected, 9)}</row>`,
  ].join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView workbookViewId="0" showGridLines="0"/>
  </sheetViews>
  <cols>
    <col min="1" max="6" width="18" customWidth="1"/>
  </cols>
  <sheetData>${rows}</sheetData>
  <mergeCells count="9">
    <mergeCell ref="A1:F1"/>
    <mergeCell ref="A2:F2"/>
    <mergeCell ref="A3:F3"/>
    <mergeCell ref="A5:B5"/>
    <mergeCell ref="C5:D5"/>
    <mergeCell ref="E5:F5"/>
    <mergeCell ref="A6:B6"/>
    <mergeCell ref="C6:D6"/>
    <mergeCell ref="E6:F6"/>
  </mergeCells>
</worksheet>`;
}


function xlsxReportsSheetXml(reports: Report[]): string {
  const headers = [
    'ID',
    'Report Title',
    'Category',
    'Status',
    'Location',
    'Reported By',
    'Email',
    'Date Reported',
    'Description',
    'Evidence Photos',
  ];

  const headerCells = headers
    .map((header, index) => xlsxInlineCell(index + 1, 1, header, 3))
    .join('');

  const rows = reports
    .map((report, index) => {
      const row = index + 2;
      const values = [
        `#${report.id.slice(0, 8).toUpperCase()}`,
        report.title || '',
        report.category || '',
        report.status || '',
        report.location || '',
        report.reportedByName || '',
        report.reportedByEmail || '',
        formatExportDateTime(report.createdAt),
        report.description || '',
        String(getReportImageRefs(report).length),
      ];

      return `<row r="${row}" ht="42" customHeight="1">${values
        .map((value, columnIndex) =>
          xlsxInlineCell(
            columnIndex + 1,
            row,
            value,
            columnIndex === 3 ? xlsxStatusStyle(report.status || '') : 4,
          ),
        )
        .join('')}</row>`;
    })
    .join('');

  const lastRow = Math.max(1, reports.length + 1);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>

  <cols>
    <col min="1" max="1" width="14" customWidth="1"/>
    <col min="2" max="2" width="28" customWidth="1"/>
    <col min="3" max="3" width="19" customWidth="1"/>
    <col min="4" max="4" width="15" customWidth="1"/>
    <col min="5" max="5" width="34" customWidth="1"/>
    <col min="6" max="6" width="22" customWidth="1"/>
    <col min="7" max="7" width="28" customWidth="1"/>
    <col min="8" max="8" width="23" customWidth="1"/>
    <col min="9" max="9" width="48" customWidth="1"/>
    <col min="10" max="10" width="16" customWidth="1"/>
  </cols>

  <sheetData>
    <row r="1" ht="28" customHeight="1">${headerCells}</row>
    ${rows}
  </sheetData>

  <autoFilter ref="A1:J${lastRow}"/>
</worksheet>`;
}


async function reportsToStyledXlsx(
  reports: Report[],
  label: string,
): Promise<Blob> {
  const zip = new JSZip();
  const summary = summarizeReports(reports);
  const generatedAt = new Date().toLocaleString();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
  );

  zip.folder('_rels')?.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  );

  const xl = zip.folder('xl');
  xl?.file(
    'workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Summary" sheetId="1" r:id="rId1"/>
    <sheet name="Reports" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`,
  );

  xl?.folder('_rels')?.file(
    'workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  );

  xl?.file('styles.xml', xlsxStylesXml());

  const worksheets = xl?.folder('worksheets');
  worksheets?.file(
    'sheet1.xml',
    xlsxSummarySheetXml(summary, label, generatedAt),
  );
  worksheets?.file('sheet2.xml', xlsxReportsSheetXml(reports));

  return zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}


/* ------------------------------------------------------------------
 * STYLED DOCX EXPORT
 * ------------------------------------------------------------------ */

function wordRun(
  value: unknown,
  options?: { bold?: boolean; color?: string; size?: number },
): string {
  const props = [
    options?.bold ? '<w:b/>' : '',
    options?.color ? `<w:color w:val="${options.color}"/>` : '',
    options?.size ? `<w:sz w:val="${options.size}"/>` : '',
    options?.size ? `<w:szCs w:val="${options.size}"/>` : '',
  ].join('');

  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${escapeXml(
    value,
  )}</w:t></w:r>`;
}


function wordParagraph(
  value: unknown,
  options?: {
    bold?: boolean;
    color?: string;
    size?: number;
    after?: number;
    align?: 'left' | 'center';
  },
): string {
  return `<w:p>
    <w:pPr>
      ${options?.align ? `<w:jc w:val="${options.align}"/>` : ''}
      ${options?.after !== undefined ? `<w:spacing w:after="${options.after}"/>` : ''}
    </w:pPr>
    ${wordRun(value, options)}
  </w:p>`;
}


function wordCell(
  value: unknown,
  shade = 'FFFFFF',
  options?: { bold?: boolean; color?: string; width?: number },
): string {
  return `<w:tc>
    <w:tcPr>
      ${options?.width ? `<w:tcW w:w="${options.width}" w:type="dxa"/>` : ''}
      <w:shd w:fill="${shade}"/>
      <w:tcMar>
        <w:top w:w="90" w:type="dxa"/>
        <w:left w:w="110" w:type="dxa"/>
        <w:bottom w:w="90" w:type="dxa"/>
        <w:right w:w="110" w:type="dxa"/>
      </w:tcMar>
    </w:tcPr>
    ${wordParagraph(value, {
      bold: options?.bold,
      color: options?.color,
      size: 20,
      after: 0,
    })}
  </w:tc>`;
}


function wordStatusShade(status: string): string {
  if (status === 'Pending') return 'FFF0B8';
  if (status === 'In Review') return 'D9E8FF';
  if (status === 'Resolved') return 'D8F0DA';
  if (status === 'Rejected') return 'FFDCDC';
  return 'E9EEE8';
}


async function reportsToStyledDocx(
  reports: Report[],
  label: string,
): Promise<Blob> {
  const zip = new JSZip();
  const summary = summarizeReports(reports);

  const overviewRows = reports
    .map(
      (report) => `
      <w:tr>
        ${wordCell(`#${report.id.slice(0, 8).toUpperCase()}`, 'FFFFFF')}
        ${wordCell(report.title || '', 'FFFFFF')}
        ${wordCell(report.category || '', 'FFFFFF')}
        ${wordCell(report.status || '', wordStatusShade(report.status || ''), {
          bold: true,
        })}
        ${wordCell(report.location || '', 'FFFFFF')}
        ${wordCell(formatExportDateTime(report.createdAt), 'FFFFFF')}
      </w:tr>`,
    )
    .join('');

  const detailSections = reports
    .map(
      (report, index) => `
      ${wordParagraph(`REPORT ${String(index + 1).padStart(2, '0')}`, {
        bold: true,
        color: '4A8C50',
        size: 18,
        after: 80,
      })}
      ${wordParagraph(report.title || 'Untitled report', {
        bold: true,
        color: '145C1E',
        size: 30,
        after: 50,
      })}
      ${wordParagraph(`#${report.id.slice(0, 10).toUpperCase()}  •  ${report.status || ''}`, {
        color: '647064',
        size: 18,
        after: 120,
      })}

      <w:tbl>
        <w:tblPr>
          <w:tblW w:w="0" w:type="auto"/>
          <w:tblBorders>
            <w:top w:val="single" w:sz="4" w:color="DDE3DB"/>
            <w:left w:val="single" w:sz="4" w:color="DDE3DB"/>
            <w:bottom w:val="single" w:sz="4" w:color="DDE3DB"/>
            <w:right w:val="single" w:sz="4" w:color="DDE3DB"/>
            <w:insideH w:val="single" w:sz="4" w:color="DDE3DB"/>
            <w:insideV w:val="single" w:sz="4" w:color="DDE3DB"/>
          </w:tblBorders>
        </w:tblPr>
        <w:tr>
          ${wordCell('Category', 'F4F7F3', { bold: true })}
          ${wordCell(report.category || 'Not specified', 'FFFFFF')}
          ${wordCell('Date Reported', 'F4F7F3', { bold: true })}
          ${wordCell(formatExportDateTime(report.createdAt) || 'Not recorded', 'FFFFFF')}
        </w:tr>
        <w:tr>
          ${wordCell('Location', 'F4F7F3', { bold: true })}
          ${wordCell(report.location || 'Not specified', 'FFFFFF')}
          ${wordCell('Reported By', 'F4F7F3', { bold: true })}
          ${wordCell(report.reportedByName || 'Unknown', 'FFFFFF')}
        </w:tr>
        <w:tr>
          ${wordCell('Email', 'F4F7F3', { bold: true })}
          ${wordCell(report.reportedByEmail || 'Not provided', 'FFFFFF')}
          ${wordCell('Evidence Photos', 'F4F7F3', { bold: true })}
          ${wordCell(String(getReportImageRefs(report).length), 'FFFFFF')}
        </w:tr>
      </w:tbl>

      ${wordParagraph('Description', {
        bold: true,
        color: '145C1E',
        size: 22,
        after: 50,
      })}
      ${wordParagraph(report.description || 'No description provided.', {
        color: '444444',
        size: 20,
        after: 180,
      })}

      <w:p>
        <w:pPr><w:spacing w:after="180"/></w:pPr>
        <w:r><w:br w:type="page"/></w:r>
      </w:p>`,
    )
    .join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
      </w:tblPr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:shd w:fill="145C1E"/></w:tcPr>
          ${wordParagraph('ECOBANTAY', {
            bold: true,
            color: 'FFFFFF',
            size: 20,
            after: 60,
          })}
          ${wordParagraph('Environmental Reports', {
            bold: true,
            color: 'FFFFFF',
            size: 38,
            after: 40,
          })}
          ${wordParagraph('Environmental monitoring and community reporting export', {
            color: 'E7F2E1',
            size: 20,
            after: 80,
          })}
        </w:tc>
      </w:tr>
    </w:tbl>

    ${wordParagraph(`Generated: ${new Date().toLocaleString()}`, {
      color: '647064',
      size: 18,
      after: 20,
    })}
    ${wordParagraph(`Date Range: ${label}`, {
      color: '647064',
      size: 18,
      after: 160,
    })}

    ${wordParagraph('Export Summary', {
      bold: true,
      color: '145C1E',
      size: 28,
      after: 80,
    })}

    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:color="DDE3DB"/>
          <w:left w:val="single" w:sz="4" w:color="DDE3DB"/>
          <w:bottom w:val="single" w:sz="4" w:color="DDE3DB"/>
          <w:right w:val="single" w:sz="4" w:color="DDE3DB"/>
          <w:insideH w:val="single" w:sz="4" w:color="DDE3DB"/>
          <w:insideV w:val="single" w:sz="4" w:color="DDE3DB"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tr>
        ${wordCell(`Total\n${summary.total}`, 'E7F2E1', { bold: true })}
        ${wordCell(`In Review\n${summary.inReview}`, 'E4F1FC', { bold: true })}
        ${wordCell(`Pending\n${summary.pending}`, 'FFF5D9', { bold: true })}
        ${wordCell(`Resolved\n${summary.resolved}`, 'E2F3E4', { bold: true })}
        ${wordCell(`Rejected\n${summary.rejected}`, 'FCE5E5', { bold: true })}
      </w:tr>
    </w:tbl>

    ${wordParagraph('Report Overview', {
      bold: true,
      color: '145C1E',
      size: 28,
      after: 80,
    })}

    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:color="D9E0D6"/>
          <w:left w:val="single" w:sz="4" w:color="D9E0D6"/>
          <w:bottom w:val="single" w:sz="4" w:color="D9E0D6"/>
          <w:right w:val="single" w:sz="4" w:color="D9E0D6"/>
          <w:insideH w:val="single" w:sz="4" w:color="E5EAE3"/>
          <w:insideV w:val="single" w:sz="4" w:color="E5EAE3"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tr>
        ${wordCell('ID', '145C1E', { bold: true, color: 'FFFFFF' })}
        ${wordCell('Report', '145C1E', { bold: true, color: 'FFFFFF' })}
        ${wordCell('Category', '145C1E', { bold: true, color: 'FFFFFF' })}
        ${wordCell('Status', '145C1E', { bold: true, color: 'FFFFFF' })}
        ${wordCell('Location', '145C1E', { bold: true, color: 'FFFFFF' })}
        ${wordCell('Date Reported', '145C1E', { bold: true, color: 'FFFFFF' })}
      </w:tr>
      ${overviewRows}
    </w:tbl>

    <w:p><w:r><w:br w:type="page"/></w:r></w:p>

    ${wordParagraph('Report Details', {
      bold: true,
      color: '145C1E',
      size: 30,
      after: 140,
    })}

    ${detailSections}

    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900" w:header="450" w:footer="450" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
  );

  zip.folder('_rels')?.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
  );

  const word = zip.folder('word');
  word?.file('document.xml', documentXml);
  word?.folder('_rels')?.file(
    'document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  );
  word?.file(
    'styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/>
      <w:sz w:val="20"/>
      <w:szCs w:val="20"/>
    </w:rPr>
  </w:style>
</w:styles>`,
  );

  const props = zip.folder('docProps');
  props?.file(
    'core.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties
 xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:dcmitype="http://purl.org/dc/dcmitype/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>EcoBantay Environmental Reports</dc:title>
  <dc:creator>EcoBantay</dc:creator>
  <cp:lastModifiedBy>EcoBantay</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
</cp:coreProperties>`,
  );
  props?.file(
    'app.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>EcoBantay</Application>
</Properties>`,
  );

  return zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}


/* ------------------------------------------------------------------
 * STYLED PDF EXPORT
 * Lightweight dependency-free PDF writer using built-in Helvetica.
 * ------------------------------------------------------------------ */

function pdfSafeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}


function pdfColor(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}


function wrapPdfText(value: unknown, maxChars: number): string[] {
  const text = String(value ?? '').trim();
  if (!text) return [''];

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = word;

    while (current.length > maxChars) {
      lines.push(current.slice(0, maxChars));
      current = current.slice(maxChars);
    }
  }

  if (current) lines.push(current);
  return lines;
}


function buildStyledPdf(
  reports: Report[],
  label: string,
): Blob {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 38;
  const contentWidth = pageWidth - margin * 2;
  const summary = summarizeReports(reports);

  const pages: string[][] = [];
  let current: string[] = [];
  let y = 0;

  const rect = (
    x: number,
    top: number,
    width: number,
    height: number,
    fill: string,
    stroke?: string,
  ) => {
    const pdfY = pageHeight - top - height;
    current.push(`${pdfColor(fill)} rg`);
    if (stroke) {
      current.push(`${pdfColor(stroke)} RG 0.7 w`);
      current.push(`${x} ${pdfY} ${width} ${height} re B`);
    } else {
      current.push(`${x} ${pdfY} ${width} ${height} re f`);
    }
  };

  const line = (
    x1: number,
    top1: number,
    x2: number,
    top2: number,
    color = '#D9E0D6',
  ) => {
    current.push(`${pdfColor(color)} RG 0.6 w`);
    current.push(
      `${x1} ${pageHeight - top1} m ${x2} ${pageHeight - top2} l S`,
    );
  };

  const textCmd = (
    value: unknown,
    x: number,
    top: number,
    size = 10,
    bold = false,
    color = '#1F2A20',
  ) => {
    current.push(
      `${pdfColor(color)} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x} ${
        pageHeight - top
      } Tm (${pdfSafeText(value)}) Tj ET`,
    );
  };

  const drawPageHeader = (subtitle = 'Environmental Reports') => {
    rect(0, 0, pageWidth, 62, '#145C1E');
    textCmd('ECOBANTAY', margin, 24, 9, true, '#DDF0DE');
    textCmd(subtitle, margin, 44, 20, true, '#FFFFFF');
    y = 84;
  };

  const newPage = (subtitle?: string) => {
    if (current.length) pages.push(current);
    current = [];
    drawPageHeader(subtitle);
  };

  newPage('Environmental Reports');

  textCmd(`Generated: ${new Date().toLocaleString()}`, margin, y, 9, false, '#647064');
  y += 16;
  textCmd(`Date Range: ${label}`, margin, y, 9, false, '#647064');
  y += 25;

  const cardGap = 6;
  const cardWidth = (contentWidth - cardGap * 4) / 5;
  const stats = [
    ['Total', summary.total, '#E7F2E1'],
    ['In Review', summary.inReview, '#E4F1FC'],
    ['Pending', summary.pending, '#FFF5D9'],
    ['Resolved', summary.resolved, '#E2F3E4'],
    ['Rejected', summary.rejected, '#FCE5E5'],
  ] as const;

  stats.forEach(([labelText, value, color], index) => {
    const x = margin + index * (cardWidth + cardGap);
    rect(x, y, cardWidth, 58, color, '#D9E0D6');
    textCmd(labelText, x + 8, y + 18, 7.5, true, '#647064');
    textCmd(String(value), x + 8, y + 43, 20, true, '#172018');
  });
  y += 78;

  textCmd('Report Overview', margin, y, 14, true, '#145C1E');
  y += 16;

  const columns = [
    { title: 'ID', width: 58 },
    { title: 'Report', width: 116 },
    { title: 'Category', width: 74 },
    { title: 'Status', width: 62 },
    { title: 'Location', width: 118 },
    { title: 'Date', width: 91 },
  ];

  const tableHeaderHeight = 24;
  rect(margin, y, contentWidth, tableHeaderHeight, '#174F22');
  let x = margin;
  columns.forEach((column) => {
    textCmd(column.title, x + 5, y + 16, 7, true, '#FFFFFF');
    x += column.width;
  });
  y += tableHeaderHeight;

  for (const report of reports) {
    const rowHeight = 34;
    if (y + rowHeight > pageHeight - 52) {
      newPage('Report Overview');
      rect(margin, y, contentWidth, tableHeaderHeight, '#174F22');
      let headerX = margin;
      columns.forEach((column) => {
        textCmd(column.title, headerX + 5, y + 16, 7, true, '#FFFFFF');
        headerX += column.width;
      });
      y += tableHeaderHeight;
    }

    rect(margin, y, contentWidth, rowHeight, '#FFFFFF', '#E2E7DF');
    const values = [
      `#${report.id.slice(0, 6).toUpperCase()}`,
      report.title || '',
      report.category || '',
      report.status || '',
      report.location || '',
      report.createdAt ? new Date(report.createdAt).toLocaleDateString() : '',
    ];

    let valueX = margin;
    values.forEach((value, index) => {
      const maxChars = Math.max(5, Math.floor(columns[index].width / 5.2));
      const lines = wrapPdfText(value, maxChars).slice(0, 2);
      lines.forEach((valueLine, lineIndex) => {
        textCmd(
          valueLine,
          valueX + 5,
          y + 12 + lineIndex * 10,
          7,
          index === 3,
          '#2B332B',
        );
      });
      valueX += columns[index].width;
    });

    y += rowHeight;
  }

  y += 24;
  textCmd('Report Details', margin, y, 15, true, '#145C1E');
  y += 22;

  reports.forEach((report, index) => {
    const descLines = wrapPdfText(report.description || 'No description provided.', 88);
    const locationLines = wrapPdfText(report.location || 'Not specified', 62);
    const blockHeight =
      106 + Math.max(1, descLines.length) * 11 + Math.max(0, locationLines.length - 1) * 10;

    if (y + blockHeight > pageHeight - 48) {
      newPage('Report Details');
    }

    rect(margin, y, contentWidth, blockHeight, '#FFFFFF', '#D9E1D7');
    rect(margin, y, contentWidth, 38, '#F6FAF4');

    textCmd(`REPORT ${String(index + 1).padStart(2, '0')}`, margin + 12, y + 14, 7, true, '#4A8C50');
    textCmd(report.title || 'Untitled report', margin + 12, y + 29, 12, true, '#143E1C');

    const statusWidth = 72;
    rect(
      margin + contentWidth - statusWidth - 12,
      y + 9,
      statusWidth,
      20,
      report.status === 'Pending'
        ? '#FFF0B8'
        : report.status === 'In Review'
          ? '#D9E8FF'
          : report.status === 'Resolved'
            ? '#D8F0DA'
            : report.status === 'Rejected'
              ? '#FFDCDC'
              : '#E9EEE8',
    );
    textCmd(
      report.status || '',
      margin + contentWidth - statusWidth - 6,
      y + 23,
      7,
      true,
      '#334033',
    );

    let detailY = y + 54;
    textCmd('Category', margin + 12, detailY, 7, true, '#718071');
    textCmd(report.category || 'Not specified', margin + 82, detailY, 8.5, true, '#293329');
    textCmd('Reporter', margin + 282, detailY, 7, true, '#718071');
    textCmd(report.reportedByName || 'Unknown', margin + 342, detailY, 8.5, true, '#293329');

    detailY += 16;
    textCmd('Date', margin + 12, detailY, 7, true, '#718071');
    textCmd(formatExportDateTime(report.createdAt) || 'Not recorded', margin + 82, detailY, 8, false, '#293329');
    textCmd('Evidence', margin + 282, detailY, 7, true, '#718071');
    textCmd(`${getReportImageRefs(report).length} photo(s)`, margin + 342, detailY, 8, false, '#293329');

    detailY += 18;
    textCmd('Location', margin + 12, detailY, 7, true, '#718071');
    locationLines.slice(0, 2).forEach((valueLine, lineIndex) => {
      textCmd(valueLine, margin + 82, detailY + lineIndex * 10, 8, false, '#293329');
    });

    detailY += 20 + Math.max(0, locationLines.length - 1) * 10;
    line(margin + 12, detailY, margin + contentWidth - 12, detailY);
    detailY += 15;
    textCmd('Description', margin + 12, detailY, 7, true, '#718071');
    detailY += 12;

    descLines.forEach((valueLine, lineIndex) => {
      textCmd(valueLine, margin + 12, detailY + lineIndex * 11, 8, false, '#414A41');
    });

    y += blockHeight + 14;
  });

  if (current.length) pages.push(current);

  pages.forEach((page, index) => {
    page.push(
      `${pdfColor('#7A847A')} rg BT /F1 7 Tf 1 0 0 1 ${margin} 20 Tm (${pdfSafeText(
        `EcoBantay Environmental Report Export`,
      )}) Tj ET`,
    );
    page.push(
      `${pdfColor('#7A847A')} rg BT /F1 7 Tf 1 0 0 1 ${
        pageWidth - margin - 54
      } 20 Tm (${pdfSafeText(`Page ${index + 1} of ${pages.length}`)}) Tj ET`,
    );
  });

  const objects: Record<number, string> = {};
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

  const pageRefs: string[] = [];

  pages.forEach((page, index) => {
    const pageObjectNumber = 5 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    pageRefs.push(`${pageObjectNumber} 0 R`);

    const content = `${page.join('\n')}\n`;
    const streamLength = new TextEncoder().encode(content).length;

    objects[pageObjectNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;

    objects[contentObjectNumber] =
      `<< /Length ${streamLength} >>\nstream\n${content}endstream`;
  });

  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageRefs.join(
    ' ',
  )}] >>`;

  const maxObject = 4 + pages.length * 2;
  let pdf = '%PDF-1.4\n%EcoBantay\n';
  const offsets: number[] = [0];

  for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
    offsets[objectNumber] = new TextEncoder().encode(pdf).length;
    pdf += `${objectNumber} 0 obj\n${objects[objectNumber]}\nendobj\n`;
  }

  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${maxObject + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
    pdf += `${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
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
  baseName: string,
  label: string,
  primaryFile: { name: string; blob: Blob },
): Promise<{ blob: Blob; packed: number; missing: number }> {
  const zip = new JSZip();
  const folder = zip.folder(baseName) || zip;

  // Keep the selected finished export inside the backup ZIP too.
  folder.file(primaryFile.name, primaryFile.blob);

  // Keep a browser-friendly preview with the same polished layout.
  folder.file(
    `${baseName}-preview.html`,
    reportsToPrintableHtml(
      reports,
      'EcoBantay Environmental Reports',
      label,
      fetchedImages,
    ),
  );

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
        'Open image-urls.txt for the original image references.',
        '',
        ...missingLines,
      ].join('\n'),
    );
  }

  folder.file(
    'README.txt',
    [
      'EcoBantay report export backup',
      `Generated: ${new Date().toISOString()}`,
      `Range: ${label}`,
      `Reports: ${reports.length}`,
      `Images packed: ${packed}`,
      `Images missing: ${missingLines.length}`,
      '',
      `Primary export: ${primaryFile.name}`,
      `Preview: ${baseName}-preview.html`,
      'Evidence images are under images/<reportId>/ when available.',
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
}): Promise<{
  count: number;
  format: string;
  imageCount: number;
  imagesMissing: number;
}> {
  const all = await loadAllReports();
  const filtered = filterReportsForExport(all, input.filters);
  const baseName = (
    input.fileName || `ecobantay-reports-${Date.now()}`
  ).replace(/\.[^.]+$/, '');
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

  let primaryFileName = '';
  let primaryMime = '';
  let primaryBlob: Blob;

  if (input.format === 'pdf') {
    primaryFileName = `${baseName}.pdf`;
    primaryMime = 'application/pdf';
    primaryBlob = buildStyledPdf(filtered, label);
  } else if (input.format === 'excel') {
    primaryFileName = `${baseName}.xlsx`;
    primaryMime =
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    primaryBlob = await reportsToStyledXlsx(filtered, label);
  } else if (input.format === 'word') {
    primaryFileName = `${baseName}.docx`;
    primaryMime =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    primaryBlob = await reportsToStyledDocx(filtered, label);
  } else {
    throw new Error(
      `Unsupported export format: ${input.format}. Choose PDF, Excel, or Word.`,
    );
  }

  // Download only the selected finished file plus the image backup ZIP.
  // No window.open() / print popup is used.
  downloadBrowserFile(primaryFileName, primaryBlob, primaryMime);

  const zipResult = await buildBackupZip(
    filtered,
    fetchedImages,
    baseName,
    label,
    {
      name: primaryFileName,
      blob: primaryBlob,
    },
  );

  downloadBrowserFile(
    `${baseName}-backup.zip`,
    zipResult.blob,
    'application/zip',
  );

  return {
    count: filtered.length,
    format: input.format,
    imageCount: zipResult.packed,
    imagesMissing: zipResult.missing,
  };
}

