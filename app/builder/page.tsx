import SpecPackBuilder from "@/components/SpecPackBuilder";

export default function BuilderPage() {
  return (
    <>
      <h1>Builder</h1>
      <p className="small">
        A page-by-page wizard that generates a deterministic Spec Pack ZIP.
        Offline is the default. Hosted/Local AI connectors are optional.
      </p>
      <SpecPackBuilder />
    </>
  );
}
