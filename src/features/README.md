# `src/features/` — Estructura canónica (recursiva)

Cada dominio y subfeature sigue este mismo patrón:

```
src/features/<dominio>/
├── pages/                   ← Pantallas (lazy en routes.config.ts)
├── components/              ← Compartidos del dominio
├── hooks/                   ← Hooks compartidos del dominio
├── types/                   ← Modelos canónicos (no DTOs)
├── navigation.ts            ← Opcional: rutas del dominio
│
├── <subfeature>/            ← Mismo patrón (recursivo)
│   ├── pages/
│   ├── components/
│   ├── hooks/
│   ├── types/
│   │
│   └── <sub-subfeature>/    ← Mismo patrón (N niveles)
│       ├── components/
│       ├── hooks/
│       └── types/
```

**Reglas del patrón:**

1. **Toda subfeature** (de cualquier profundidad) tiene su propio `components/` + `hooks/` + `types/`.
2. **No se replica `pages/`** en niveles profundos si no hay ruta URL propia — los componentes de UI profunda viven en `components/`, y las pages solo en el nivel que tenga entrada en el router.
3. **Lo compartido entre subfeatures hermanas** va en el `components/` / `hooks/` / `types/` del padre.
4. **`models/`** se usa excepcionalmente para lógica de negocio pura sin UI (casos de uso, cálculos, validaciones complejas).
5. **Profundidad máxima práctica:** 3-4 niveles (dominio → subfeature → sub-subfeature → helpers de UI).

**Ejemplo genérico:**

```
src/features/proyectos/
├── pages/ProyectosDashboardPage.tsx
├── components/ProyectoCard.tsx        ← compartido entre subfeatures
├── hooks/useProyectos.ts             ← compartido
├── types/proyecto.ts
│
├── alcance/
│   ├── pages/AlcancePage.tsx
│   ├── components/AlcanceWizard.tsx
│   ├── hooks/useAlcance.ts
│   ├── types/alcance.ts
│   │
│   └── entregables/
│       ├── components/EntregableTable.tsx
│       ├── components/modal/
│       │   └── EntregableFormModal.tsx
│       ├── hooks/useEntregables.ts
│       └── types/entregable.ts
│
└── costos/
    ├── pages/CostosPage.tsx
    ├── components/CostosChart.tsx
    ├── hooks/useCostos.ts
    └── types/costo.ts
```

Documentación detallada: **`docs/erp-features-structure.md`** · mapeo con IA: **`docs/client-feature-mapping-guide.md`** · índice: **`docs/README.md`**.

Modelos de negocio aquí en `types/`, no en `src/types/` (solo `src/types/core/base.ts`).
