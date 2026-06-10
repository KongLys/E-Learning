import { redirect } from 'next/navigation';

// The course editor moved to the sidebar-based `/manage` flow.
// Redirect old `/edit` links to the curriculum section.
export default async function EditCourseRedirect(
  props: PageProps<'/instructor/courses/[id]/edit'>,
) {
  const { id } = await props.params;
  redirect(`/instructor/courses/${id}/manage/curriculum`);
}
