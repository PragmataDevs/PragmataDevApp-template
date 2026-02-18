# Instrucciones para GitHub Copilot

Sigue estas reglas estrictamente en cada interacción.

## 1. Contexto y Arquitectura
*   **Lee siempre `docs/architecture.md`:** Antes de planificar o sugerir código, revisa este archivo para alinearte con la arquitectura del proyecto (Estructura de directorios Feature-Based, Stack React+Vite+Supabase+PowerSync+Tailwind, Flujo de Datos Híbrido, etc.).

## 2. Flujo de Trabajo y Aprobación
*   **Planificación Obligatoria:** Antes de escribir código, presenta un plan detallado paso a paso. Especifica qué archivos se crearán, cuáles se modificarán y la lógica detrás de los cambios.
*   **Consentimiento Explícito:** NO modifiques ni crees archivos sin que el usuario haya aprobado explícitamente el plan propuesto.
*   **Sin Modificaciones Silenciosas:** Nunca realices cambios que no hayan sido discutidos y aprobados.

## 3. Incertidumbre y Suposiciones
*   **NO Inferir:** Si no estás 100% seguro de cómo implementar una funcionalidad, de dónde obtener un dato, o si la tarea no tiene un precedente claro en el código existente: **PREGUNTA**.
*   **Aclarar Dudas:** Es mejor detenerse y pedir clarificación que asumir una implementación incorrecta o inconsistente con el negocio.

## 4. Seguridad y Calidad
*   **Seguridad Primero:** NUNCA sugieras o implementes soluciones que pongan en riesgo la seguridad del código o de la información (ej. exponer secretos, ignorar validaciones de permisos, consultas SQL inseguras).
*   **Protección de Datos:** Respeta siempre las reglas de seguridad definidas (Row Level Security en Supabase, validación en capas, etc.).

## 5. Estándares Técnicos (Resumen de Arquitectura)
*   **Stack:** React, Vite, TypeScript, Tailwind CSS, Shadcn/ui, Supabase, PowerSync.
*   **Directorios:** Respeta estrictamente la estructura `src/features`, `src/components`, `src/lib`, etc.
*   **Mobile First:** Tailwind siempre pensando en móvil primero.
*   **Consultas:** Lectura a SQLite (Local), Escritura a Supabase (Nube).
