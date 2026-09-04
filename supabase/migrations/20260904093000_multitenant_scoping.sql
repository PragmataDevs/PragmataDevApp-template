-- ============================================================================
-- multitenant_scoping — cierra las fugas entre tenants que el modo plataforma
-- vuelve explotables (spec §0, hoyos 3 y 5; hallazgo T3c de la prueba de
-- aislamiento del 4-sep-2026: un admin veía las entities de OTRO team).
-- ============================================================================
-- Qué hace (todo idéntico en comportamiento para clientes mono-tenant):
--   1. entities: el SELECT se acota al propio team (o platform owner / god).
--      Antes: check_permission('page_settings_entities','read') dejaba ver TODAS.
--   2. products / orders / order_items / cms_pages: sus policies son mono-tenant
--      (sin team_id). En modo plataforma quedan CERRADAS para todos salvo god;
--      con platform_mode apagado se comportan exactamente igual que antes.
--      Cuando un producto de plataforma necesite estas tablas, se les agrega
--      team_id en una migración propia (spec §6, 093000 original).
--   3. notification_broadcasts: el fan-out 'role' y 'all' se acota al team del
--      remitente. Antes notificaba a TODOS los profiles de TODAS las tenants.
--
-- ⚠️ BACKPORT: crm-objetiva y clibsa tienen policies propias sobre entities
--    (team operador). Fusionar: conservar su lógica y agregar el candado por team.
-- Idempotente. Reversa: down_20260904093000_multitenant_scoping.sql
-- ============================================================================
BEGIN;

-- ── 1. entities acotadas por team ────────────────────────────────────────────
DROP POLICY IF EXISTS "View Authorized Entities" ON public.entities;
CREATE POLICY "View Authorized Entities" ON public.entities FOR SELECT USING (
    public.is_god()
    OR public.my_team_is_platform_owner()
    OR (
        team_id = public.get_my_team_id()
        AND (
            id IN (SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid())
            OR public.check_permission('page_settings_entities', 'read')
        )
    )
);

-- ── 1b. Escritura de entities: INSERT con WITH CHECK por team ────────────────
-- Hallazgo T6a (4-sep-2026): la policy "Manage Entities" FOR ALL usaba
-- check_permission('page_settings_entities','update', id) también para INSERT;
-- ese check busca la entity en la tabla y en un INSERT la fila aún no existe →
-- un admin NO podía crear entities (solo god). Se separa por operación.
DROP POLICY IF EXISTS "Manage Entities" ON public.entities;
DROP POLICY IF EXISTS "Insert Entities" ON public.entities;
CREATE POLICY "Insert Entities" ON public.entities FOR INSERT WITH CHECK (
    public.is_god()
    OR (team_id = public.get_my_team_id() AND public.check_permission('page_settings_entities', 'create'))
);
DROP POLICY IF EXISTS "Update Entities" ON public.entities;
CREATE POLICY "Update Entities" ON public.entities FOR UPDATE
  USING (public.is_god() OR public.check_permission('page_settings_entities', 'update', id))
  WITH CHECK (public.is_god() OR team_id = public.get_my_team_id());
DROP POLICY IF EXISTS "Delete Entities" ON public.entities;
CREATE POLICY "Delete Entities" ON public.entities FOR DELETE
  USING (public.is_god() OR public.check_permission('page_settings_entities', 'delete', id));

-- ── 2. Tablas mono-tenant cerradas en modo plataforma ────────────────────────
DROP POLICY IF EXISTS "products_select_public" ON public.products;
CREATE POLICY "products_select_public" ON public.products
  FOR SELECT USING (public.is_god() OR (NOT public.is_platform_mode() AND status = 'active'));

DROP POLICY IF EXISTS "products_write_admin" ON public.products;
CREATE POLICY "products_write_admin" ON public.products
  FOR ALL USING (public.is_god() OR (
    NOT public.is_platform_mode()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_level IN ('god', 'admin'))
  ));

DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders
  FOR SELECT USING (
    public.is_god()
    OR (NOT public.is_platform_mode() AND (
      customer_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_level = 'admin')
    ))
  );

DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT USING (
    public.is_god()
    OR (NOT public.is_platform_mode() AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE id = order_items.order_id AND customer_user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "cms_pages_public_select_published" ON public.cms_pages;
CREATE POLICY "cms_pages_public_select_published" ON public.cms_pages
  FOR SELECT USING (NOT public.is_platform_mode() AND status = 'active' AND is_published = true);

DROP POLICY IF EXISTS "cms_pages_staff_select" ON public.cms_pages;
CREATE POLICY "cms_pages_staff_select" ON public.cms_pages
  FOR SELECT USING (public.is_god() OR (NOT public.is_platform_mode() AND public.check_permission('page_seo_site_pages', 'read')));

DROP POLICY IF EXISTS "cms_pages_staff_insert" ON public.cms_pages;
CREATE POLICY "cms_pages_staff_insert" ON public.cms_pages
  FOR INSERT WITH CHECK (public.is_god() OR (NOT public.is_platform_mode() AND public.check_permission('page_seo_site_pages', 'create')));

DROP POLICY IF EXISTS "cms_pages_staff_update" ON public.cms_pages;
CREATE POLICY "cms_pages_staff_update" ON public.cms_pages
  FOR UPDATE
  USING (public.is_god() OR (NOT public.is_platform_mode() AND public.check_permission('page_seo_site_pages', 'update')))
  WITH CHECK (public.is_god() OR (NOT public.is_platform_mode() AND public.check_permission('page_seo_site_pages', 'update')));

-- ── 3. Fan-out de notificaciones acotado al team del remitente ───────────────
CREATE OR REPLACE FUNCTION public.handle_notification_broadcast()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sender_team UUID;
BEGIN
    SELECT team_id INTO v_sender_team FROM public.profiles WHERE id = NEW.sender_id;

    IF NEW.target_type = 'user' THEN
        INSERT INTO public.notifications (recipient_id, sender_id, broadcast_id, type, title, body, action_url, created_by)
        SELECT NEW.target_id, NEW.sender_id, NEW.id, NEW.type, NEW.title, NEW.body, NEW.action_url, NEW.sender_id
        FROM public.profiles p
        WHERE p.id = NEW.target_id
          AND (v_sender_team IS NULL OR p.team_id = v_sender_team OR public.is_god());

    ELSIF NEW.target_type = 'role' THEN
        INSERT INTO public.notifications (recipient_id, sender_id, broadcast_id, type, title, body, action_url, created_by)
        SELECT p.id, NEW.sender_id, NEW.id, NEW.type, NEW.title, NEW.body, NEW.action_url, NEW.sender_id
        FROM public.profiles p
        WHERE p.role_id = NEW.target_id
          AND p.profile_status = 'active'
          AND p.status = 'active'
          AND (v_sender_team IS NULL OR p.team_id = v_sender_team);

    ELSIF NEW.target_type = 'all' THEN
        INSERT INTO public.notifications (recipient_id, sender_id, broadcast_id, type, title, body, action_url, created_by)
        SELECT p.id, NEW.sender_id, NEW.id, NEW.type, NEW.title, NEW.body, NEW.action_url, NEW.sender_id
        FROM public.profiles p
        WHERE p.profile_status = 'active'
          AND p.status = 'active'
          AND (v_sender_team IS NULL OR p.team_id = v_sender_team);
    END IF;

    RETURN NEW;
END;
$$;

COMMIT;
