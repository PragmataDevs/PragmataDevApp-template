import { supabase } from '@/lib/supabase';

function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return '';

  const candidate = error as {
    message?: string;
    details?: string;
    hint?: string;
  };

  return [candidate.message, candidate.details, candidate.hint].filter(Boolean).join(' ');
}

export function isSessionHydrationError(error: unknown): boolean {
  const code = typeof error === 'object' && error ? (error as { code?: string }).code : undefined;
  const message = getErrorMessage(error);

  return (
    code === 'PGRST301' ||
    code === 'PGRST302' ||
    /jwt|auth session|session.*missing|session.*expired|invalid token|not authenticated/i.test(message)
  );
}

export async function withSessionRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isSessionHydrationError(error)) {
      throw error;
    }

    console.warn(`[${context}] Auth/session error detected. Attempting single recovery.`, error);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      console.warn(`[${context}] Retry skipped. No recoverable session found.`, sessionError ?? error);
      throw error;
    }

    console.info(`[${context}] Session recovered. Retrying once.`);
    return operation();
  }
}