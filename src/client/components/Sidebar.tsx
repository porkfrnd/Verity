export type NavSection = "investigate" | "evidence" | "history";

const ITEMS: Array<{ id: NavSection; label: string; navLabel: string; hint: string }> = [
  { id: "investigate", label: "Investigate", navLabel: "Go to investigation form", hint: "New claim" },
  { id: "evidence", label: "Evidence", navLabel: "Go to evidence", hint: "Verdict & sources" },
  { id: "history", label: "History", navLabel: "Go to research history", hint: "Past research" },
];

/**
 * Sidebar navigation contents (shared by the desktop rail and the mobile
 * drawer). Real destinations only: page sections, settings dialog, theme.
 */
export function SidebarNav({
  active,
  onNavigate,
  onOpenSettings,
  theme,
  onToggleTheme,
  pending,
}: {
  active: NavSection;
  onNavigate: (section: NavSection) => void;
  onOpenSettings: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  pending: boolean;
}) {
  return (
    <>
      <div className="brand">
        Verity <small>research workspace</small>
      </div>
      <nav aria-label="Primary">
        <ul className="side-nav">
          {ITEMS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`side-link${active === item.id ? " is-active" : ""}`}
                aria-current={active === item.id ? "page" : undefined}
                aria-label={item.navLabel}
                onClick={() => onNavigate(item.id)}
              >
                <span>{item.label}</span>
                <small>{item.hint}</small>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="side-foot">
        <button type="button" className="btn btn-small side-action" onClick={onOpenSettings}>
          Settings
        </button>
        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-pressed={theme === "dark"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? "☾ dark" : "☀ light"}
        </button>
        {pending && (
          <p className="side-status" aria-live="polite">
            <span aria-hidden="true">● </span>Investigating…
          </p>
        )}
      </div>
    </>
  );
}
