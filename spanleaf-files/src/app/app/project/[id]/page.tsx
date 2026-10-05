import EditorClient from "@/editor/EditorClient";

export const metadata = { title: "Editor" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorClient projectId={id} />;
}
