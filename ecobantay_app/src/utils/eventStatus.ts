import type { EventStatus } from '@/types/event';

/** Badge colors aligned with admin event moderation statuses. */
export function getEventStatusColors(status: EventStatus | string) {
  switch (status) {
    case 'Pending':
      return { backgroundColor: '#FFF0B8', color: '#D99A00' };
    case 'Upcoming':
    case 'Ongoing':
    case 'Accepted':
      return { backgroundColor: '#C7DDFF', color: '#315BC9' };
    case 'Completed':
      return { backgroundColor: '#BFEBC5', color: '#168A18' };
    case 'Rejected':
      return { backgroundColor: '#FFCACA', color: '#C62828' };
    default:
      return { backgroundColor: '#E8E8E8', color: '#555555' };
  }
}

/** Citizen-facing label: admin "Upcoming/Ongoing" maps to Accepted. */
export function getUserFacingEventStatus(status: EventStatus | string): string {
  if (status === 'Upcoming' || status === 'Ongoing') return 'Accepted';
  return status;
}

export const USER_EVENT_TABS = [
  {
    key: 'ALL',
    label: 'ALL',
    statuses: ['Pending', 'Upcoming', 'Ongoing', 'Completed', 'Rejected'] as EventStatus[],
  },
  { key: 'PENDING', label: 'PENDING', statuses: ['Pending'] as EventStatus[] },
  {
    key: 'ACCEPTED',
    label: 'ACCEPTED',
    statuses: ['Upcoming', 'Ongoing', 'Completed'] as EventStatus[],
  },
  { key: 'REJECTED', label: 'REJECTED', statuses: ['Rejected'] as EventStatus[] },
] as const;

export type UserEventTabKey = (typeof USER_EVENT_TABS)[number]['key'];
