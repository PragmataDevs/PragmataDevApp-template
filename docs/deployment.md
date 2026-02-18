# Guía de Deployment - PragmataDevApp

## Estrategia de Entornos

### Supabase Branches
```
PragmataDevApp (Proyecto)
├── main (Production)    → Datos reales de usuarios + PowerSync activo
└── develop (Staging)    → Testing y desarrollo + PowerSync desactivado (feature flag)
```

### PowerSync Instances (Estrategia Hybrid)

**Actual (Fase 1):**
- **Production Instance**: `https://698671bed930100f5017667f.powersync.journeyapps.com`
  - Conectada a branch `main` de Supabase
  - **Costo**: $4/mes (IPv4 + Cloud)
  - **Uso**: Solo en Vercel Production (VITE_ENABLE_POWERSYNC=true)

- **Development**: Sin PowerSync
  - Fallback a Supabase client directo
  - **Costo**: $0 adicional
  - **Uso**: Localhost + Vercel Preview (VITE_ENABLE_POWERSYNC=false)

**Futuro (Fase 2 - cuando escale):**
- Crear segunda instancia para branch `develop`
- Habilitar offline-first también en staging
- Cambiar flag a `true` para Preview

---

## Variables de Entorno

### 1. Localhost (Archivo `.env`)

Archivo ya configurado en raíz del proyecto:

```env
VITE_SUPABASE_URL=https://sujrpevoqzumivxqeuzq.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_POWERSYNC_URL=https://698671bed930100f5017667f.powersync.journeyapps.com
VITE_ENABLE_POWERSYNC=false
```

**Importante**: 
- Este archivo está en `.gitignore`
- PowerSync está **deshabilitado** en development (`VITE_ENABLE_POWERSYNC=false`)
- Si PowerSync falla, la app fallback a Supabase client automáticamente

---

## 2. Vercel (Dashboard)

### Cómo configurar

1. Ve a tu proyecto en Vercel → **Settings** → **Environment Variables**

2. Configura las siguientes variables:

### Para Production (Branch `main`)

| Variable | Value | Environment |
|----------|-------|-------------|
| `VITE_SUPABASE_URL` | `https://sujrpevoqzumivxqeuzq.supabase.co` | ✅ Production |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | ✅ Production |
| `VITE_POWERSYNC_URL` | `https://698671bed930100f5017667f.powersync.journeyapps.com` | ✅ Production |
| `VITE_ENABLE_POWERSYNC` | `true` | ✅ Production |

### Para Preview/Development (Branch `develop`)

| Variable | Value | Environment |
|----------|-------|-------------|
| `VITE_SUPABASE_URL` | `https://sujrpevoqzumivxqeuzq.supabase.co` | ✅ Preview<br>✅ Development |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | ✅ Preview<br>✅ Development |
| `VITE_POWERSYNC_URL` | `https://698671bed930100f5017667f.powersync.journeyapps.com` | ✅ Preview<br>✅ Development |
| `VITE_ENABLE_POWERSYNC` | `false` | ✅ Preview<br>✅ Development |

**Nota**: Vercel permite variables con el mismo nombre pero diferente valor según el scope (Production vs Preview).

---

## 3. Feature Flag: VITE_ENABLE_POWERSYNC

### ¿Qué hace?

En `src/lib/db/PowerSyncProvider.tsx`:

```tsx
const enablePowerSync = import.meta.env.VITE_ENABLE_POWERSYNC === 'true'

if (!enablePowerSync) {
  console.log('ℹ️ PowerSync deshabilitado - usando Supabase client directo')
  setReady(true)
  return children  // Sin PowerSync, sin SQLite local
}

// Si está habilitado, inicializar PowerSync normalmente
```

### Beneficios

- ✅ Una sola instancia PowerSync (ahorra $4/mes)
- ✅ Development/Staging sin complejidad offline
- ✅ Si PowerSync falla, fallback automático a Supabase online
- ✅ Escalable: cambiar flag cuando crezca (Fase 2)

---

## 4. Flujo de Trabajo (Git + Vercel)

### Development Local
```bash
git checkout develop
npm run dev  # VITE_ENABLE_POWERSYNC=false del .env
# Prueba con Supabase client directo
```

### Preview (Branch develop en Vercel)
```bash
git checkout develop
git add .
git commit -m "feat: nueva funcionalidad"
git push origin develop
```
→ Vercel despliega automáticamente con `VITE_ENABLE_POWERSYNC=false`

### Production (Branch main en Vercel)
```bash
git checkout main
git merge develop
git push origin main
```
→ Vercel despliega automáticamente con `VITE_ENABLE_POWERSYNC=true` (PowerSync activo)

---

## 5. Escalabilidad (Fase 2 - Futuro)

### Cuando develop tenga muchos usuarios

1. **Crear segunda instancia PowerSync**
   - Nombre: `PragmataDevApp-Develop`
   - Conectada a branch `develop` de Supabase
   - Deployar las mismas Sync Rules

2. **Actualizar variables en Vercel**
   ```
   VITE_ENABLE_POWERSYNC=true (Preview/Development)
   VITE_POWERSYNC_URL=https://[nueva-url].powersync.journeyapps.com (Preview/Development)
   ```

3. **Costo adicional**: +$4/mes por segunda instancia + IPv4

---

## 6. Checklist Pre-Deploy a Production

- [ ] Ejecutar `04_add_id_to_role_definitions.sql` en branch `main`
- [ ] Ejecutar ALTER PUBLICATION en ambos branches
- [ ] Deployar Sync Rules en PowerSync Instance (main)
- [ ] Verificar que Vercel tiene `VITE_ENABLE_POWERSYNC=true` para Production
- [ ] Probar login en Vercel Preview (debe funcionar sin PowerSync)
- [ ] Probar login en Vercel Production (debe tener PowerSync offline)
- [ ] Verificar logs: "ℹ️ PowerSync deshabilitado" en Preview
- [ ] Verificar logs: "🔄 Iniciando PowerSync..." en Production

---

## 7. Troubleshooting

### "PowerSync connection failed" en Production
- Verifica que la instancia PowerSync tenga IPv4 habilitado ($4/mes)
- Valida que las Sync Rules estén deployed correctamente
- Revisa que el JWT Secret esté configurado en PowerSync
- Confirma que `VITE_ENABLE_POWERSYNC=true` en Vercel Production

### "Supabase auth error"
- Confirma que el ANON_KEY es el correcto para el branch
- Verifica que la URL de Supabase sea la correcta
- Revisa que las RLS policies estén activas

### "Data not syncing" en Production
- Revisa que las tablas estén en la publicación `powersync`
- Confirma que las Sync Rules incluyan las tablas necesarias
- Valida que el usuario tenga permisos en `sys_project_access`

### App lenta en Preview (Development)
- Esperado: sin SQLite local, todo va a Supabase (online)
- Esto es normal durante desarrollo
- En Production, tendrá caché offline (SQLite)
