export function assertStatusTransition(from: string, to: string, allowed: Record<string, string[]>): void {
  const next = allowed[from] || [];
  if (!next.includes(to)) {
    throw new Error(`Invalid status transition ${from} -> ${to}`);
  }
}

/** Type-surface helpers used by appointments/finance; delegates to assertStatusTransition. */
export function assertAppointmentTransition(from: string, to: string): void {
  assertStatusTransition(from, to, {
    SCHEDULED: ['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'RESCHEDULED', 'IN_PROGRESS'],
    CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED', 'IN_PROGRESS'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
    RESCHEDULED: ['SCHEDULED', 'CONFIRMED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
    NO_SHOW: [],
  });
}

export function assertPaymentRefundable(status: string): void {
  assertStatusTransition(status, 'REFUNDED', {
    PAID: ['REFUNDED'],
    PARTIALLY_PAID: ['REFUNDED'],
    REFUNDED: [],
  });
}

export function orderStatusFromPaid(paid: boolean): string {
  return paid ? 'PAID' : 'UNPAID';
}
