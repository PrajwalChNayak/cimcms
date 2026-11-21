import type { ReactNode } from "react";

export interface NavSubItem {
  label: string;
  path: string;
}

export interface NavItem {
  label: string;
  path?: string;
  icon: ReactNode;
  children?: NavSubItem[];
}
