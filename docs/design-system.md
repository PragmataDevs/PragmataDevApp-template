# PragmataDevs Design System

Tokens de diseño, tipografía y paleta de colores oficial.

## 1. Tipografía (Geist)

### Headings
*   **Heading 1 (Extrabold):** font-extrabold tracking-tight text-5xl
*   **Heading 2 (Bold):** font-bold tracking-tight text-4xl
*   **Heading 3 (Semibold):** font-semibold text-2xl

### Body & Mono
**Body Text:** El veloz murciélago hindú comía feliz cardillo y kiwi. La cigüeña tocaba el saxofón detrás del palenque de paja. Diseñado para alta legibilidad en interfaces densas.

**Font Mono:** `import { useState } from 'react';`

## 2. Paleta de Colores

| Nombre | Variable Ref | Hex | Uso |
| :--- | :--- | :--- | :--- |
| **brand-accent** | `primary` | `#0EA5E9` | Acción / Sincronización |
| **brand-dark** | `foreground` | `#0F172A` | Texto principal / Headers |
| **brand-steel** | `muted` | `#334155` | Texto secundario |
| **brand-surface** | `background` | `#F8FAFC` | Fondo de inputs/cards |

## 3. Componentes Base

### Botones
*   **Primary Button:** `px-6 py-2.5 bg-brand-accent hover:bg-sky-600 text-white font-medium rounded-pragmata transition-colors tracking-tight`
*   **Secondary Button:** `px-6 py-2.5 bg-white border border-gray-200 text-brand-dark font-medium rounded-pragmata hover:bg-brand-surface transition-colors`

### Cards
Ejemplo de tarjeta usando bordes técnicos y esquinas "pragmata" (4px).

```tsx
<div className="p-6 bg-white border border-gray-100 rounded-pragmata shadow-sm hover:shadow-md transition-shadow">
    <div className="w-10 h-10 bg-brand-surface rounded-pragmata flex items-center justify-center mb-4 text-brand-accent">
        <Icon size={20} />
    </div>
    <h3 className="font-bold text-lg mb-2">Card Component</h3>
    <p className="text-brand-steel text-sm leading-relaxed">
        Este es un ejemplo de tarjeta usando bordes técnicos y esquinas "pragmata" (4px).
    </p>
</div>
```
