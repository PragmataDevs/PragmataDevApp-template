-- ============================================================================
-- Activar conditions/role_variables — F0 Módulo Agente Operativo
-- ============================================================================
-- Contexto: `sys_role_definitions.conditions` y `profiles.role_variables` ya
-- existen en el schema base (20260111120000) y se propagan hasta
-- `sys_user_permissions.conditions` vía `handle_permission_sync`, pero hasta
-- hoy NINGUNA función los lee — `check_permission()` solo evalúa
-- god/admin/member + `granted_actions`, sin fila.
--
-- DECISIÓN DE DISEÑO (documentada, no se repregunta sin volver a leer esto):
-- `conditions` (ej. `{"created_by": "$me"}`) es scoping A NIVEL DE FILA — pero
-- `check_permission(resource, action, context_project_id)` responde una
-- pregunta distinta: "¿tiene el usuario el permiso sobre este resource_code en
-- general?", sin recibir nunca una fila concreta.
--
-- Se evaluaron dos caminos (ver plan-rollout-2026-08-05.md §5.2 y el prompt de
-- esta tarea):
--   (a) Extender check_permission() con un parámetro `context_row JSONB`.
--   (b) Un helper NUEVO y separado, check_row_conditions(), pensado para USARSE
--       DENTRO de policies RLS, dejando check_permission() intacto.
--
-- Se eligió (b) por tres razones:
--   1. Separa limpiamente dos preguntas distintas: "¿puedo ver esta
--      pantalla/botón?" (check_permission, sin fila) vs "¿esta fila específica
--      me pertenece?" (RLS + check_row_conditions, con fila). Mezclarlas en una
--      sola función de 70 líneas ya usada en TODAS las policies del schema
--      aumenta el radio de un bug de seguridad.
--   2. check_permission() se usa hoy en decenas de policies y en el front
--      (usePermission().hasPermission) sin fila disponible — agregarle un
--      parámetro opcional que casi nunca se usa es ruido para el 95% de sus
--      llamadas.
--   3. El precedente real del template (IndPack, `user_sucursal_access` +
--      `get_my_sucursal_ids()`) YA resuelve scoping por fila con un helper
--      standalone invocado directo en la policy — check_row_conditions()
--      generaliza ese mismo patrón en vez de inventar uno nuevo. Migrar
--      IndPack al mecanismo genérico queda fuera de esta tarea (F0 es solo
--      template, ninguna app de cliente se toca aquí).
--
-- ADITIVO Y SIN RIESGO DE REGRESIÓN: check_permission() NO se modifica en esta
-- migración (su CREATE OR REPLACE ni siquiera se repite). check_row_conditions
-- es una función nueva; si `conditions = '{}'` (el default en TODAS las filas
-- hoy) devuelve TRUE inmediatamente — cero comportamiento nuevo hasta que
-- alguna policy la invoque explícitamente (ninguna lo hace todavía en el
-- template; activarla en una tabla concreta es responsabilidad de quien migre
-- ese caso, no de este F0).
-- ============================================================================

-- Vocabulario mínimo soportado (todas las claves del objeto se combinan con AND):
--   {}                                      -> TRUE (sin scoping)
--   {"<col>": "$me"}                        -> row_data->>col = auth.uid()::text
--   {"<col>": {"in": "$my_entities"}}       -> row_data->>col IN (sys_entity_access del usuario)
--   {"<col>": "$<role_variable>"}           -> row_data->>col = profiles.role_variables->>'<role_variable>'
--   {"<col>": <literal>}                    -> comparación literal
CREATE OR REPLACE FUNCTION public.check_row_conditions(
    conditions      JSONB,
    row_data        JSONB,
    context_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    current_uid   UUID := COALESCE(context_user_id, auth.uid());
    user_profile  public.profiles%ROWTYPE;
    cond_key      TEXT;
    cond_value    JSONB;
    expected_text TEXT;
    var_name      TEXT;
    row_value     TEXT;
BEGIN
    -- Default: sin condiciones = sin scoping. Comportamiento idéntico a hoy
    -- para el 100% de las filas existentes (conditions default '{}').
    IF conditions IS NULL OR conditions = '{}'::jsonb THEN
        RETURN TRUE;
    END IF;

    IF current_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT * INTO user_profile FROM public.profiles WHERE id = current_uid;
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    FOR cond_key, cond_value IN SELECT * FROM jsonb_each(conditions) LOOP
        row_value := row_data ->> cond_key;

        IF jsonb_typeof(cond_value) = 'object' AND cond_value ? 'in' THEN
            -- Forma { "<col>": { "in": "$my_entities" } }
            IF cond_value ->> 'in' = '$my_entities' THEN
                IF row_value IS NULL OR NOT EXISTS (
                    SELECT 1 FROM public.sys_entity_access
                    WHERE user_id = current_uid AND entity_id::text = row_value
                ) THEN
                    RETURN FALSE;
                END IF;
            ELSE
                -- Forma de "in" desconocida: fail-closed, no inventar semántica.
                RETURN FALSE;
            END IF;

        ELSIF cond_value = to_jsonb('$me'::text) THEN
            -- Forma { "<col>": "$me" }
            IF row_value IS DISTINCT FROM current_uid::text THEN
                RETURN FALSE;
            END IF;

        ELSIF jsonb_typeof(cond_value) = 'string' AND (cond_value #>> '{}') LIKE '$%' THEN
            -- Forma { "<col>": "$<role_variable>" } — interpola profiles.role_variables
            var_name := substr(cond_value #>> '{}', 2);
            expected_text := user_profile.role_variables ->> var_name;
            IF expected_text IS NULL OR row_value IS DISTINCT FROM expected_text THEN
                RETURN FALSE;
            END IF;

        ELSE
            -- Literal: compara como texto plano.
            expected_text := cond_value #>> '{}';
            IF row_value IS DISTINCT FROM expected_text THEN
                RETURN FALSE;
            END IF;
        END IF;
    END LOOP;

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.check_row_conditions(JSONB, JSONB, UUID) IS
  'Scoping a nivel de fila para conditions/role_variables (RBAC). Usar DENTRO de '
  'policies RLS: USING (public.is_god() OR public.check_row_conditions(conditions, to_jsonb(tabla.*))). '
  'NO reemplaza check_permission() (ese sigue siendo el gate de recurso/acción sin fila). '
  'conditions = ''{}'' => TRUE siempre (sin scoping, comportamiento actual).';
