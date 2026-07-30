import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export type EnvPromptSpec = {
  key: string;
  label: string;
  required?: boolean;
  secret?: boolean;
};

export async function promptLine(label: string, secret = false): Promise<string> {
  if (!process.stdin.isTTY) return '';

  const rl = createInterface({ input, output });
  try {
    if (secret && 'mute' in output && typeof (output as NodeJS.WriteStream & { mute?: (v: boolean) => void }).mute === 'function') {
      (output as NodeJS.WriteStream & { mute: (v: boolean) => void }).mute(true);
    }
    const answer = await rl.question(`${label}: `);
    return answer.trim();
  } finally {
    if (secret && 'mute' in output && typeof (output as NodeJS.WriteStream & { mute?: (v: boolean) => void }).mute === 'function') {
      (output as NodeJS.WriteStream & { mute: (v: boolean) => void }).mute(false);
    }
    rl.close();
  }
}

export async function resolveEnvWithPrompts(
  env: Record<string, string>,
  specs: EnvPromptSpec[],
): Promise<Record<string, string>> {
  const next = { ...env };

  for (const spec of specs) {
    if (next[spec.key]?.trim()) continue;

    if (!process.stdin.isTTY) {
      if (spec.required) {
        throw new Error(
          `Falta ${spec.key} en .env.cloud y no hay TTY para pedirlo. ` +
            `Añádelo al archivo o ejecuta el script en una terminal interactiva.`,
        );
      }
      continue;
    }

    const value = await promptLine(spec.label, spec.secret);
    if (!value && spec.required) {
      throw new Error(`Se requiere ${spec.key}.`);
    }
    if (value) next[spec.key] = value;
  }

  return next;
}
