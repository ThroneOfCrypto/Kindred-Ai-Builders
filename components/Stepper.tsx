"use client";

export type StepItem = {
  id: string;
  title: string;
  hint: string;
};

export function Stepper({
  steps,
  activeId,
  doneIds,
  onSelect,
}: {
  steps: StepItem[];
  activeId: string;
  doneIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="stepper" role="navigation" aria-label="Wizard steps">
      {steps.map((s, idx) => {
        const active = s.id === activeId;
        const done = doneIds.has(s.id);
        const cls = ["step", active ? "active" : "", done ? "done" : ""].filter(Boolean).join(" ");
        return (
          <div
            key={s.id}
            className={cls}
            style={{ cursor: "pointer" }}
            onClick={() => onSelect(s.id)}
            role="button"
            tabIndex={0}
          >
            <div className="k">{idx + 1}</div>
            <div className="t">
              <strong>{s.title}</strong>
              <span>{s.hint}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
