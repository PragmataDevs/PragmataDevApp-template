/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { RouteGuard } from './RouteGuard';

const auth = vi.hoisted(() => ({
  state: { isAuthenticated: true, mfaRequired: false },
}));

vi.mock('../hooks/useAuth', () => ({ useAuth: () => auth.state }));
vi.mock('../hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, isAdmin: () => true, loading: false }),
}));

/** Muestra a dónde nos mandó el guard. */
function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="loc">{pathname + search}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mfa" element={<LocationProbe />} />
        <Route path="/login" element={<LocationProbe />} />
        <Route
          path="/settings/usuarios"
          element={
            <RouteGuard resourceCode="page_settings_usuarios">
              <div>App protegida</div>
            </RouteGuard>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RouteGuard + MFA', () => {
  beforeEach(() => {
    auth.state = { isAuthenticated: true, mfaRequired: false };
  });

  it('aal1 con nextLevel aal2 (mfaRequired) → redirige a /mfa conservando el destino', () => {
    auth.state = { isAuthenticated: true, mfaRequired: true };
    renderAt('/settings/usuarios?tab=2');

    const loc = screen.getByTestId('loc').textContent ?? '';
    expect(loc.startsWith('/mfa?')).toBe(true);
    expect(new URLSearchParams(loc.slice(loc.indexOf('?'))).get('next')).toBe('/settings/usuarios?tab=2');
    expect(screen.queryByText('App protegida')).not.toBeInTheDocument();
  });

  it('sesión aal2 (o sin TOTP) entra normal', () => {
    renderAt('/settings/usuarios');
    expect(screen.getByText('App protegida')).toBeInTheDocument();
  });

  it('sin sesión → /login, aunque mfaRequired sea true', () => {
    auth.state = { isAuthenticated: false, mfaRequired: true };
    renderAt('/settings/usuarios');
    expect(screen.getByTestId('loc')).toHaveTextContent('/login');
  });
});
