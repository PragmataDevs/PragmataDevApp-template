// src/lib/db/PowerSyncProvider.tsx
import { type ReactNode, type Context, useEffect, useState } from 'react';

type PowerSyncDbLike = unknown;

export const PowerSyncProvider = ({ children }: { children: ReactNode }) => {
  // Feature flag para habilitar/deshabilitar PowerSync
  const enablePowerSync = import.meta.env.VITE_ENABLE_POWERSYNC === 'true';
  
  const [ready, setReady] = useState(false);
  const [powerSyncDb, setPowerSyncDb] = useState<PowerSyncDbLike | null>(null);
  const [powerSyncContext, setPowerSyncContext] = useState<Context<PowerSyncDbLike> | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Si PowerSync está deshabilitado, saltamos la inicialización
    if (!enablePowerSync) {
      console.log('ℹ️ PowerSync deshabilitado - usando Supabase client directo');
      setReady(true);
      return;
    }

    // Si está habilitado, inicializar PowerSync
    console.log('🔄 Iniciando PowerSync...');

    const bootstrap = async () => {
      const [{ PowerSyncContext }, { initPowerSync, db }] = await Promise.all([
        import('@powersync/react'),
        import('./index'),
      ]);

      await initPowerSync();

      if (!isMounted) return;
      setPowerSyncContext(PowerSyncContext as unknown as Context<PowerSyncDbLike>);
      setPowerSyncDb(db as unknown as PowerSyncDbLike);
      console.log('✅ PowerSync listo');
      setReady(true);
    };

    bootstrap().catch((error) => {
      console.error('❌ Error inicializando PowerSync, usando fallback online:', error);
      if (!isMounted) return;
      setPowerSyncContext(null);
      setPowerSyncDb(null);
      setReady(true);
    });

    return () => {
      isMounted = false;
    };
  }, [enablePowerSync]);

  if (!ready) {
    return (
        <div className="h-screen w-full flex items-center justify-center bg-slate-50 flex-col gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600"></div>
            <p className="text-slate-500 text-sm animate-pulse">Iniciando Base de Datos...</p>
        </div>
    );
  }

  // Si PowerSync está habilitado, usar PowerSyncContext
  if (enablePowerSync && powerSyncContext && powerSyncDb) {
    const Provider = powerSyncContext.Provider;
    return (
      <Provider value={powerSyncDb}>
        {children}
      </Provider>
    );
  }

  // Si PowerSync está deshabilitado, solo pasar los children sin contexto
  return children;
};
