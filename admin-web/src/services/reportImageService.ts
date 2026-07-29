import type { Report } from '@/types/admin';

/**
 * Purpose: Resolves the image references available for an environmental report.
 * How it works:
 * 1. Legacy image URLs and current image-path fields are read from the report document.
 * 2. Current image paths are preferred when present.
 * 3. Legacy URLs remain available for reports created under the earlier schema.
 * Technologies Used: TypeScript and report data produced by Firebase Storage workflows.
 * Why this implementation: Schema fallback preserves evidence visibility across stored report versions.
 */
export async function resolveReportImageUrls(report: Report): Promise<string[]> {
  // Keep both storage-reference generations available before selecting the preferred source.
  const legacyUrls = report.images?.length ? report.images : [];
  const directUrls = report.imagePaths?.length ? report.imagePaths : [];
  return directUrls.length ? directUrls : legacyUrls;
}
