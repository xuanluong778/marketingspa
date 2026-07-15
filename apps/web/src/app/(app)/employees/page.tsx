import { redirect } from 'next/navigation';

/** Legacy route — redirect sang HRM Phase 1 */
export default function EmployeesRedirectPage() {
  redirect('/hrm/employees');
}
