/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { MfaSection } from './MfaSection';

// `vi.mock` se hoistea por encima de los imports: el objeto compartido va en
// `vi.hoisted` para que la factory pueda referenciarlo.
const mfa = vi.hoisted(() => ({
  listFactors: vi.fn(),
  enroll: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  unenroll: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { mfa } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const base = { created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' };
const verified = { ...base, id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'App autenticadora' };
const stale = { ...base, id: 'stale', factor_type: 'totp', status: 'unverified' };

const list = (all: unknown[], totp: unknown[]) => ({ data: { all, totp, phone: [], webauthn: [] }, error: null });

function renderSection() {
  return render(
    <ConfirmProvider>
      <MfaSection />
    </ConfirmProvider>,
  );
}

describe('MfaSection', () => {
  beforeEach(() => {
    mfa.listFactors.mockReset();
    mfa.enroll.mockReset();
    mfa.challenge.mockReset();
    mfa.verify.mockReset();
    mfa.unenroll.mockReset();
    mfa.unenroll.mockResolvedValue({ data: { id: 'x' }, error: null });
  });

  it('al abrir limpia los factores sin verificar y ofrece activar', async () => {
    mfa.listFactors.mockResolvedValue(list([stale], []));

    renderSection();

    await waitFor(() => expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'stale' }));
    expect(await screen.findByRole('button', { name: 'Activar verificación en dos pasos' })).toBeInTheDocument();
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });

  it('enrola: muestra QR y clave, verifica con challenge+verify y queda activo', async () => {
    mfa.listFactors
      .mockResolvedValueOnce(list([], [])) // al abrir
      .mockResolvedValueOnce(list([verified], [verified])); // tras verify
    mfa.enroll.mockResolvedValue({
      data: {
        id: 'f1',
        type: 'totp',
        friendly_name: 'App autenticadora',
        totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://x' },
      },
      error: null,
    });
    mfa.challenge.mockResolvedValue({ data: { id: 'c1', type: 'totp', expires_at: 0 }, error: null });
    mfa.verify.mockResolvedValue({ data: { access_token: 't' }, error: null });

    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: 'Activar verificación en dos pasos' }));

    expect(mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'App autenticadora' });
    const qr = await screen.findByAltText('Código QR para tu app autenticadora');
    expect(qr).toHaveAttribute('src', 'data:image/svg+xml;utf-8,<svg/>');
    expect(screen.getByTestId('mfa-secret')).toHaveTextContent('JBSWY3DPEHPK3PXP');

    const confirmBtn = screen.getByRole('button', { name: 'Confirmar código' });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Código de tu app autenticadora/), { target: { value: '123456' } });
    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(mfa.verify).toHaveBeenCalledWith({ factorId: 'f1', challengeId: 'c1', code: '123456' }));
    expect(mfa.challenge).toHaveBeenCalledWith({ factorId: 'f1' });

    expect(await screen.findByText('2FA activo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar verificación en dos pasos' })).not.toBeInTheDocument();
  });

  it('quitar pide confirmación y desenrola el factor', async () => {
    mfa.listFactors
      .mockResolvedValueOnce(list([verified], [verified]))
      .mockResolvedValueOnce(list([], []));

    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: 'Quitar' }));
    // Abre el diálogo de confirmación (destructivo); su botón también dice "Quitar".
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Quitar' }));

    await waitFor(() => expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f1' }));
    expect(await screen.findByRole('button', { name: 'Activar verificación en dos pasos' })).toBeInTheDocument();
  });
});
