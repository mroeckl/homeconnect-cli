export class CliError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.details = sanitizeDetails(details);
  }
}

export function isCliError(value: unknown): value is CliError {
  return value instanceof CliError;
}

function sanitizeDetails(
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!details) {
    return undefined;
  }

  const sanitized = Object.fromEntries(
    Object.entries(details).filter(
      ([, value]) => value !== null && value !== undefined,
    ),
  );

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}
