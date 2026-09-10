"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar, { getModuleLabel } from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const moduleLabel = getModuleLabel(pathname);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile-Topbar (nur < lg) */}
        <header className="lg:hidden flex items-center gap-3 h-14 px-4 flex-shrink-0
          border-b border-gray-200 bg-white
          dark:border-gray-800 dark:bg-gray-900">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="p-1.5 -ml-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100
              dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800"
            aria-label="Menü öffnen"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="text-base font-semibold text-gray-900 dark:text-white truncate">
            {moduleLabel}
          </span>
        </header>

        <main className="flex-1 overflow-y-auto min-h-0">{children}</main>
      </div>
    </div>
  );
}
