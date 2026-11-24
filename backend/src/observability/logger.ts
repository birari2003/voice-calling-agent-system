type Level = 'debug' | 'info' | 'warn' | 'error';

/**
 * Minimal structured logger: one JSON object per line on stdout/stderr, ready for any log
 * collector. Callers must not pass secrets, tokens, passwords, audio or citizen contact data.
 */
function write(level: Level, message: string, context: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...context });
  if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
};

/** Removes credentials from URL paths before logging (citizen upload tokens live in the path). */
export function redactPath(path: string): string {
  return path
    .split('?')[0]!
    .replace(/(\/public\/uploads\/)[^/]+/, '$1[redacted]')
    .replace(/(\/upload\/)[^/]+/, '$1[redacted]');
}

/** Error details safe to log: type, code and message; stack only outside production. */
export function describeError(error: unknown, includeStack: boolean): Record<string, unknown> {
  if (!(error instanceof Error)) return { errorType: typeof error };
  return {
    errorName: error.name,
    errorMessage: error.message.slice(0, 500),
    ...('code' in error ? { errorCode: String((error as { code: unknown }).code) } : {}),
    ...(includeStack && error.stack
      ? { stack: error.stack.split('\n').slice(0, 8).join('\n') }
      : {}),
  };
}
