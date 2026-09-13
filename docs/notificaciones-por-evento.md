# Notificaciones por evento

> El sistema de notificaciones estaba completo… menos el último tramo.
> Verificado el 8-ago-2026: **cero archivos** en el template y en los 5 clientes
> insertaban una notificación. Había tablas, RLS, adjuntos, broadcasts y la UI
> para verlas — y **ningún emisor**. Por eso en producción estaban vacías: no es
> que nadie las usara, es que nunca llegaba ninguna.

Esta doc es el mecanismo. **El catálogo de qué avisar lo define cada cliente**,
porque depende de su negocio: un contratista subiendo una estimación en Clibsa no
se parece a un cambio de ranking en LawRank.

---

## Las tres formas de avisar

Viven en la base (`20260808200000_notificar_evento.sql`) y se llaman desde triggers:

| Función | Para qué |
|---|---|
| `notificar_a(usuario, título, …)` | una persona concreta |
| `notificar_equipo(team, título, …)` | todos los miembros activos de un equipo |
| `notificar_con_permiso(recurso, acción, team, …)` | **quien pueda actuar** sobre eso |

La tercera es la buena para flujos de aprobación: el destinatario **sale del RBAC**,
no de una lista escrita a mano. Si mañana cambias quién aprueba estimaciones, el
aviso lo sigue solo.

Las tres **omiten al autor del evento** — recibir *"subiste un archivo"* es ruido.

---

## Por qué en la base y no en el front

Un trigger dispara **pase lo que pase**: da igual si la fila entró por la app, por
una edge function, por un import masivo o por un script de migración.

Si el emisor viviera en el front, cualquier otro camino se saltaría el aviso **en
silencio**. Y así es exactamente como se rompen estas cosas: alguien agrega una
carga por CSV, nadie se acuerda de notificar, y el aviso deja de llegar sin que
ningún error lo delate.

---

## Ejemplos (así se aplican)

### 1. Clibsa — el contratista sube una estimación, avisar a quien la aprueba

```sql
CREATE OR REPLACE FUNCTION public.notif_estimacion_nueva()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public.notificar_con_permiso(
        'action_workspace_desarrollo_autorizar_solicitud_cobro', 'update',
        NULL,                                    -- todos los equipos que puedan
        'Nueva estimación por revisar',
        'Se registró la estimación ' || coalesce(NEW.folio, NEW.id::text),
        'action',
        '/workspace/' || NEW.entity_id || '/estimaciones/' || NEW.id,
        auth.uid()
    );
    RETURN NEW;
END $$;

CREATE TRIGGER trg_notif_estimacion_nueva
    AFTER INSERT ON public.estimaciones
    FOR EACH ROW EXECUTE FUNCTION public.notif_estimacion_nueva();
```

### 2. Objetiva — un contratista sube un documento, avisar a gerencia

```sql
PERFORM public.notificar_equipo(
    (SELECT id FROM public.teams WHERE is_platform_owner LIMIT 1),  -- la gerencia
    'Documento nuevo de contratista',
    (SELECT name FROM public.teams WHERE id = NEW.team_id) || ' subió ' || NEW.nombre,
    'info',
    '/documentos/' || NEW.id,
    auth.uid()
);
```

### 3. Seguros — el cliente sube su póliza, avisar a su asesor

```sql
PERFORM public.notificar_a(
    NEW.asesor_id,                     -- el dueño de la cuenta, no todo el equipo
    'Póliza recibida',
    'El cliente adjuntó la póliza de ' || NEW.ramo,
    'info',
    '/prospectos/' || NEW.prospecto_id,
    auth.uid()
);
```

### 4. Cambio de estado — avisar a quien lo pidió

```sql
IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    PERFORM public.notificar_a(
        NEW.created_by,                -- a quien lo levantó
        'Tu solicitud cambió a ' || NEW.estado,
        NULL, 'info', '/solicitudes/' || NEW.id, auth.uid()
    );
END IF;
```

---

## Reglas al agregar un evento

1. **Trigger `AFTER`**, no `BEFORE`: si la fila no se guardó, no hay nada que avisar.
2. **`action_url` siempre.** Una notificación sin a dónde ir es una molestia; con
   liga es una herramienta.
3. **`type = 'action'`** cuando el receptor tiene que *hacer* algo (aprobar,
   revisar); `'info'` cuando solo se entera.
4. **No notifiques todo.** El sistema muere de dos formas: vacío (como estaba) o
   tan ruidoso que se ignora. Si el usuario no va a actuar ni le cambia el día, no
   lo avises.
5. **Migración con su `down_`**, como todo cambio de esquema.
6. **Registra el check** en `ops/backport-checks.json` si el evento debe existir en
   varios clientes — si no, se olvida en uno y nadie se entera
   (ver `docs/backport-a-clientes.md`).
