import type { CSSProperties, ReactNode } from "react";

export function Panel({
  title,
  subtitle,
  actions,
  className,
  style,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className={`panel${className ? ` ${className}` : ""}`} style={style}>
      <div className="panel_header">
        <div className="panel_titles">
          <h2 className="panel_title">{title}</h2>
          {subtitle ? <p className="panel_subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="panel_actions">{actions}</div> : null}
      </div>
      <div className="hr" />
      {children}
    </div>
  );
}
