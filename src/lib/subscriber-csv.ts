import type { AdminSubscriberRecord } from './admin-subscribers-service';
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  // A quoted CSV field can still be executed as a formula by spreadsheet software.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function subscriberCSV(subscribers: AdminSubscriberRecord[]): string {
  const headers = ['User ID', 'Display Name', 'Country', 'Email', 'Phone Contact', 'Hardware ID', 'Subscription Plan', 'Status', 'Active Status', 'Start Date', 'Expires At', 'Validity', 'Currency', 'Latest Captured Amount', 'Net Amount in Shown History (Selected Currency)', 'History Complete', 'Data Source', 'Shown Transactions'];
  const rows = subscribers.map(s => [s.userId, s.displayName, s.country?.name || 'Unknown', s.email || '', s.phone || '', s.hwid || '', s.currentPlan, s.status, s.isActive ? 'Active' : 'Inactive', s.startDate, s.expiresAt, s.validityText, s.currency, s.currentAmount, s.totalAmountSubscribed, s.historyTruncated ? 'No' : 'Yes', s.source, s.history.length]);
  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
}
