/**
 * Callback page for OAuth providers (Google, GitHub, etc.)
 * Supabase processes the OAuth hash automatically on page load.
 * The AuthProvider detects the SIGNED_IN event and redirects to /dashboard.
 * This page is just a visual fallback while that happens.
 */
export default function CallbackPage() {

  return (
    <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 mb-4">
          <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        </div>
        <h2 className="text-white text-lg font-semibold">Signing in...</h2>
        <p className="text-slate-400 text-sm mt-2">Please wait while we verify your credentials</p>
      </div>
    </div>
  );
}
