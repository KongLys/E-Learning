import { redirect } from 'next/navigation';

export default async function ManageIndexPage(props: PageProps<'/instructor/courses/[id]/manage'>) {
  const { id } = await props.params;
  redirect(`/instructor/courses/${id}/manage/goals`);
}
