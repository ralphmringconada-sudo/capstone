import type { ReportStatus } from '@/types/report';

/** Badge colors aligned with the admin web report status styling. */
export function getReportStatusColors(status: ReportStatus | string) {
  switch (status) {
    case 'Pending':
      return { backgroundColor: '#FFF0B8', color: '#D99A00' };
    case 'In Review':
      return { backgroundColor: '#C7DDFF', color: '#315BC9' };
    case 'Resolved':
      return { backgroundColor: '#BFEBC5', color: '#168A18' };
    case 'Rejected':
      return { backgroundColor: '#FFCACA', color: '#C62828' };
    default:
      return { backgroundColor: '#E8E8E8', color: '#555555' };
  }
}

export const USER_REPORT_TABS = [
  { key: 'ALL', label: 'ALL', statuses: ['Pending', 'In Review', 'Resolved', 'Rejected'] as ReportStatus[] },
  { key: 'PENDING', label: 'PENDING', statuses: ['Pending'] as ReportStatus[] },
  { key: 'APPROVED', label: 'APPROVED', statuses: ['In Review'] as ReportStatus[] },
  { key: 'RESOLVED', label: 'RESOLVED', statuses: ['Resolved'] as ReportStatus[] },
  { key: 'REJECTED', label: 'REJECTED', statuses: ['Rejected'] as ReportStatus[] },
] as const;

export type UserReportTabKey = (typeof USER_REPORT_TABS)[number]['key'];
