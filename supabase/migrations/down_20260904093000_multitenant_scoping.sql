-- ROLLBACK de 20260904093000_multitenant_scoping.sql — restaura las policies y el
-- fan-out del schema base. ⚠️ Vuelven los hoyos 3 y 5 de la spec.
BEGIN;
DROP POLICY IF EXISTS "View Authorized Entities" ON public.entities;
CREATE POLICY "View Authorized Entities" ON public.entities FOR SELECT USING (
    public.is_god()
    OR id IN (SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid())
    OR public.check_permission('page_settings_entities', 'read')
);
DROP POLICY IF EXISTS "Insert Entities" ON public.entities;
DROP POLICY IF EXISTS "Update Entities" ON public.entities;
DROP POLICY IF EXISTS "Delete Entities" ON public.entities;
DROP POLICY IF EXISTS "Manage Entities" ON public.entities;
CREATE POLICY "Manage Entities" ON public.entities FOR ALL USING (
    public.is_god() OR public.check_permission('page_settings_entities', 'update', id)
);
DROP POLICY IF EXISTS "products_select_public" ON public.products;
CREATE POLICY "products_select_public" ON public.products FOR SELECT USING (status = 'active');
DROP POLICY IF EXISTS "products_write_admin" ON public.products;
CREATE POLICY "products_write_admin" ON public.products FOR ALL USING (public.is_god() OR (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_level IN ('god', 'admin'))));
DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders FOR SELECT USING (
    public.is_god() OR customer_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND access_level = 'admin'));
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT USING (
    public.is_god() OR EXISTS (SELECT 1 FROM public.orders WHERE id = order_items.order_id AND (customer_user_id = auth.uid() OR public.is_god())));
DROP POLICY IF EXISTS "cms_pages_public_select_published" ON public.cms_pages;
CREATE POLICY "cms_pages_public_select_published" ON public.cms_pages FOR SELECT USING (status = 'active' AND is_published = true);
DROP POLICY IF EXISTS "cms_pages_staff_select" ON public.cms_pages;
CREATE POLICY "cms_pages_staff_select" ON public.cms_pages FOR SELECT USING (public.is_god() OR public.check_permission('page_seo_site_pages', 'read'));
DROP POLICY IF EXISTS "cms_pages_staff_insert" ON public.cms_pages;
CREATE POLICY "cms_pages_staff_insert" ON public.cms_pages FOR INSERT WITH CHECK (public.is_god() OR public.check_permission('page_seo_site_pages', 'create'));
DROP POLICY IF EXISTS "cms_pages_staff_update" ON public.cms_pages;
CREATE POLICY "cms_pages_staff_update" ON public.cms_pages FOR UPDATE
  USING (public.is_god() OR public.check_permission('page_seo_site_pages', 'update'))
  WITH CHECK (public.is_god() OR public.check_permission('page_seo_site_pages', 'update'));

CREATE OR REPLACE FUNCTION public.handle_notification_broadcast()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.target_type = 'user' THEN
        INSERT INTO public.notifications (recipient_id, sender_id, broadcast_id, type, title, body, action_url, created_by)
        VALUES (NEW.target_id, NEW.sender_id, NEW.id, NEW.type, NEW.title, NEW.body, NEW.action_url, NEW.sender_id);
    ELSIF NEW.target_type = 'role' THEN
        INSERT INTO public.notifications (recipient_id, sender_id, broadcast_id, type, title, body, action_url, created_by)
        SELECT p.id, NEW.sender_id, NEW.id, NEW.type, NEW.title, NEW.body, NEW.action_url, NEW.sender_id
        FROM public.profiles p WHERE p.role_id = NEW.target_id AND p.profile_status = 'active' AND p.status = 'active';
    ELSIF NEW.target_type = 'all' THEN
        INSERT INTO public.notifications (recipient_id, sender_id, broadcast_id, type, title, body, action_url, created_by)
        SELECT p.id, NEW.sender_id, NEW.id, NEW.type, NEW.title, NEW.body, NEW.action_url, NEW.sender_id
        FROM public.profiles p WHERE p.profile_status = 'active' AND p.status = 'active';
    END IF;
    RETURN NEW;
END;
$$;
COMMIT;
