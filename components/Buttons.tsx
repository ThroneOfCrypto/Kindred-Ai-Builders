"use client";

import React from "react";

type BtnProps = {
  href?: string;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
};

export function PrimaryButton({ href, children, onClick, disabled }: BtnProps) {
  return (
    <a
      className={"btn primary"}
      href={disabled ? undefined : href}
      tabIndex={disabled ? -1 : undefined}
      onClick={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        onClick?.();
      }}
      aria-disabled={disabled ? "true" : "false"}
    >
      {children}
    </a>
  );
}

export function SecondaryButton({ href, children, onClick, disabled }: BtnProps) {
  return (
    <a
      className={"btn"}
      href={disabled ? undefined : href}
      tabIndex={disabled ? -1 : undefined}
      onClick={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        onClick?.();
      }}
      aria-disabled={disabled ? "true" : "false"}
    >
      {children}
    </a>
  );
}

export function DangerButton({ children, onClick, disabled }: BtnProps) {
  return (
    <button className={"btn danger"} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
