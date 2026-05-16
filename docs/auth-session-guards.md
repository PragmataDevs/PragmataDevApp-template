# Guía rápida: evitar fetches sin sesión (Supabase + React)

Estos cambios se aplicaron en este repo para eliminar pantallas vacías que aparecían cuando los hooks hacían queries antes de que Supabase terminara de hidratar la sesión. Úsalos como checklist para otros proyectos.

## 1) Asegura la configuración del cliente
- Usa `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true` y un `storageKey` estable al crear el client (`src/lib/supabase/index.ts`).
- Así evitas que una refactorización desactive el auto-refresh o que varias apps compartan el mismo key.

## 2) Gatea los fetches por el estado de Auth
- En cada hook que lea datos protegidos, inyecta `const { loading: authLoading, isAuthenticated } = useAuth();`.
- No dispares el fetch si `authLoading || !isAuthenticated`.
- Añade `authLoading` e `isAuthenticated` a las dependencias del `useEffect` que dispara el fetch para que se ejecute justo después de hidratar la sesión.

## 3) Retry defensivo ante errores de token
- Si un query devuelve `PGRST301`, `PGRST302` o un mensaje que contenga `JWT`, llama a `supabase.auth.getSession()` y reintenta una sola vez.
- Si el retry vuelve a fallar, propaga el error normal (no hagas retires infinitos).

## 4) Señales de que el bug está presente
- Usuarios deben refrescar para ver datos al abrir la app o al volver del sleep.
- Logs de Supabase muestran 401/RLS justo después de un cold start y luego éxito tras el refresh.

## 5) Checklist de implementación
- [ ] Cliente Supabase con opciones de auth explícitas.
- [ ] Hooks de datos con guard de `authLoading/isAuthenticated`.
- [ ] Efectos dependientes de auth para re-disparar fetch tras hidratar sesión.
- [ ] Retry puntual en 401/JWT inválido.
- [ ] Log/Sentry del número de 401 por pantalla para validar la mejora.

Aplicando estos pasos eliminamos la necesidad de refrescar manualmente y dejamos los fetches alineados con el ciclo de vida real de la sesión de Supabase.

## 6) Usuario dios en guards de UI

Los guards de rutas (`RouteGuard`, `usePermission`) deben usar `useAuth().isGod`, alineado con `public.is_god()` (god + `teams.is_platform_owner`). Ver **`docs/security-god-user-frontend.md`**.
