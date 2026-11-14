import AttemptRunner from "@/features/attempts/components/AttemptRunner";

export const metadata = {
  title: "Take exam | Argus AI",
};

export default function AttemptPage({ params }: { params: { id: string } }) {
  return <AttemptRunner attemptId={params.id} />;
}
