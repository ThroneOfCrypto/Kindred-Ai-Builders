import React from 'react';

export type DirectorProposalSummaryProps = {
  title: string;
  whatChanged: string[];
  why: string[];
  risks: string[];
  next: string[];
};

export function DirectorProposalSummary(props: DirectorProposalSummaryProps) {
  const { title, whatChanged, why, risks, next } = props;
  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
      <h3>{title}</h3>
      <div><strong>What changed</strong><ul>{whatChanged.map((s,i)=>(<li key={i}>{s}</li>))}</ul></div>
      <div><strong>Why</strong><ul>{why.map((s,i)=>(<li key={i}>{s}</li>))}</ul></div>
      <div><strong>Risks</strong><ul>{risks.map((s,i)=>(<li key={i}>{s}</li>))}</ul></div>
      <div><strong>Next</strong><ul>{next.map((s,i)=>(<li key={i}>{s}</li>))}</ul></div>
    </section>
  );
}
