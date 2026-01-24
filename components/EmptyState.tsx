import React from "react";

export function EmptyState(props: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  const { title, description, actions } = props;
  return (
    <div className="card" style={{ borderStyle: "dashed" }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {description ? <p style={{ color: "#444" }}>{description}</p> : null}
      {actions ? <div className="row" style={{ marginTop: 10 }}>{actions}</div> : null}
    </div>
  );
}
