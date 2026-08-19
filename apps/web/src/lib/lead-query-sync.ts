import type { QueryClient } from '@tanstack/react-query';

/** One invalidation path so Funnel / CRM / Customers / Booking / Analytics stay on the same Lead. */
export function invalidateLeadWorkspace(qc: QueryClient, leadId?: string) {
  void qc.invalidateQueries({ queryKey: ['leads'] });
  void qc.invalidateQueries({ queryKey: ['customers'] });
  void qc.invalidateQueries({ queryKey: ['appointments'] });
  void qc.invalidateQueries({ queryKey: ['customer-journey'] });
  void qc.invalidateQueries({ queryKey: ['funnel'] });
  void qc.invalidateQueries({ queryKey: ['dashboard'] });
  if (leadId) {
    void qc.invalidateQueries({ queryKey: ['leads', leadId] });
    void qc.invalidateQueries({ queryKey: ['customer-journey', 'lead', leadId] });
  }
}
