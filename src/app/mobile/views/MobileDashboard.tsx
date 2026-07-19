import { useAuth } from '../../context/AuthContext';
import { NAV_LEAVES } from '../../config/nav';
import { useI18n } from '../../i18n/I18nContext';

/**
 * Dashboard tab — grid of "installed apps" available to the signed-in
 * user's role + tenant. Same gate the desktop sidebar uses (canView +
 * isModuleAvailable), so tiles only appear for modules the user can
 * actually open. Tap opens the desktop route in a new window; a native
 * shell layer can intercept later.
 */
export function MobileDashboard() {
  const { currentUser, canView, isModuleAvailable, hasActiveAgency } = useAuth();
  const { t } = useI18n();

  const visible = NAV_LEAVES.filter(l =>
    !l.hideFromSidebar
    && canView(l.module)
    && isModuleAvailable(l.module)
    && (l.requireAlso ?? []).every(m => canView(m) && isModuleAvailable(m))
    && (l.requireFeature !== 'has-active-agency' || hasActiveAgency())
  );

  return (
    <div className="p-5 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Welcome back</p>
          <h1 className="text-2xl font-bold">{currentUser?.name ?? 'User'}</h1>
        </div>
        {currentUser?.role && (
          <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
            {currentUser.role}
          </span>
        )}
      </header>

      <section>
        <h2 className="text-sm font-semibold text-gray-600 mb-3">Your apps</h2>
        {visible.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-400">
            No apps available for your role yet.
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {visible.map(l => {
              const Icon = l.icon;
              return (
                <a
                  key={l.id}
                  href={`/?view=${l.id}`}
                  target="_blank"
                  rel="noopener"
                  className="group flex flex-col items-center gap-2 p-3 rounded-lg border bg-white hover:border-blue-300 hover:shadow-sm active:scale-[0.98] transition"
                >
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 group-hover:bg-blue-100 transition">
                    <Icon className="h-6 w-6 text-blue-600" />
                  </span>
                  <span className="text-xs text-center text-gray-700 line-clamp-2 leading-tight">
                    {t(l.labelKey)}
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
