import { Outlet } from 'react-router-dom';

/**
 * WorkspaceLayout — context wrapper for entity-scoped routes.
 * The sidebar is rendered by the parent AppLayout.
 * This component just renders the content area for workspace pages.
 */
export function WorkspaceLayout() {
  return <Outlet />;
}
