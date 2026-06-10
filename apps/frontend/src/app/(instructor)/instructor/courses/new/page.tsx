import { redirect } from 'next/navigation';

// The dedicated create page is replaced by a minimal "create course" modal on the
// course list. Keep this route stable by redirecting any old links/bookmarks.
export default function NewCourseRedirect() {
  redirect('/instructor/courses');
}
