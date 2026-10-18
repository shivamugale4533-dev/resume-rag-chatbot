import { createContext, useContext } from 'react';

export interface ShellCtx {
  /** True when the sidebar is a drawer (narrow viewports). */
  navIsDrawer: boolean;
  openNav: () => void;
}

export const ShellContext = createContext<ShellCtx>({ navIsDrawer: false, openNav: () => {} });
export const useShell = () => useContext(ShellContext);
