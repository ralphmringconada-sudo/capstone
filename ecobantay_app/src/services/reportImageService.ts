import type { EcoReport } from '@/types/report';

/**
 * Purpose: Converts stored image references into URLs that image components can display.
 * How it works: 1) accepts image paths and optional report context. 2) returns the currently usable references.
 * Technologies Used: TypeScript promises.
 * Why this implementation: A dedicated resolver provides an extension point for future protected-path resolution.
 */
export async function resolveImageUrls(imagePaths: string[], reportId?: string): Promise<string[]> {
  void reportId;
  return imagePaths;
}

/**
 * Purpose: Adds a consistent displayImages field to one report.
 * How it works: 1) reads current paths and legacy URLs. 2) resolves preferred paths. 3) returns an enriched copy.
 * Technologies Used: TypeScript generics and promises.
 * Why this implementation: Screens can render one field while remaining compatible with older report documents.
 */
export async function attachDisplayImages<T extends EcoReport>(report: T): Promise<T & { displayImages: string[] }> {
  const paths = report.imagePaths?.length ? report.imagePaths : [];
  const legacyUrls = report.images?.length ? report.images : [];
  const displayImages = paths.length ? await resolveImageUrls(paths, report.id) : legacyUrls;

  return {
    ...report,
    displayImages,
  };
}

/**
 * Purpose: Normalizes image data for a collection of reports.
 * How it works: 1) maps each report through the single-report helper. 2) waits for all resolutions concurrently.
 * Technologies Used: JavaScript Promise.all and TypeScript.
 * Why this implementation: Parallel normalization keeps dashboard loading efficient and its data shape consistent.
 */
export async function attachDisplayImagesToReports(reports: EcoReport[]) {
  return Promise.all(reports.map((report) => attachDisplayImages(report)));
}
