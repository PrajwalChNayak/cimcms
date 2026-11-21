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
  /** shown only when the user holds ALL of these permissions */
  permissions?: string[];
  /** shown only when the user holds ANY of these roles */
  roles?: string[];
  /** farm / consumer entries: hidden when VITE_FF_CIMCMS=true */
  hideWhenCimcms?: boolean;
}
