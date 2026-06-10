import { redirect } from 'next/navigation';

export default function DashboardRedirect() {
  redirect('/instructor/performance/overview');
}
