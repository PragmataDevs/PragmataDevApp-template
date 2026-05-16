# Usuario dios en el frontend

El backend define usuario **dios** con la función SQL `public.is_god()`:

```sql
profiles.access_level = 'god'
AND teams.is_platform_owner = TRUE   -- equipo del perfil
```

El ERP debe aplicar **la misma regla** en guards de rutas y sidebar. No basta con `access_level === 'god'` sin comprobar el equipo.

## Implementación canónica

| Pieza | Ubicación | Rol |
|-------|-----------|-----|
| Helper puro | `src/lib/auth/isGodUser.ts` | Espejo de `is_god()` para tests y lógica local |
| Carga de equipo | `AuthProvider` | `profiles` + join `teams(is_platform_owner)` |
| Contexto | `useAuth().isGod` | Valor derivado tras hidratar sesión |
| Permisos UI | `usePermission()` | `hasPermission` retorna `true` si `isGod` |
| Admin de rutas | `usePermission().isAdmin()` | `isGod` **o** `access_level === 'admin'` |

### AuthProvider

Al iniciar sesión se ejecuta:

```ts
supabase
  .from('profiles')
  .select('*, team:teams(is_platform_owner)')
  .eq('id', userId)
  .single();
```

Se expone:

- `teamIsPlatformOwner: boolean | null`
- `isGod: boolean` — `isGodUser(profile, teamIsPlatformOwner)`

### usePermission

```ts
if (isGod) return true;  // bypass total de resourceCode
```

`admin` sigue siendo bypass solo con `access_level === 'admin'` (scope de equipo, no global).

## Seed obligatorio

Sin las dos condiciones en DB, `is_god()` es `false` y el frontend **no** dará bypass:

1. Equipo con `is_platform_owner = TRUE`
2. Perfil con `access_level = 'god'`

Script: `docs/database/02_seed_god_user.sql`

## Qué no hacer

```ts
// ❌ PROHIBIDO — no replica is_god()
if (profile?.access_level === 'god') return true;
```

```ts
// ✅ CORRECTO
import { isGodUser } from '@/lib/auth/isGodUser';
// o desde contexto:
const { isGod } = useAuth();
if (isGod) return true;
```

## Relación con RLS

El frontend solo oculta o muestra UI. **RLS sigue siendo la fuente de verdad** en datos. Un perfil con `god` mal configurado no obtiene bypass en UI ni debería obtenerlo en DB si las policies usan `is_god()` correctamente.

Ver también: `.cursor/rules/07-god-user.mdc`, `docs/architecture.md` (sección RBAC).
