/**
 * Structured logger with automated PII redaction.
 */

const REDACT_KEYS = new Set([
  'authorization',
  'cookie',
  'sessiontoken',
  'guestaccessgrant',
  'guestcancelgrant',
  'tokendigest',
  'token',
  'secret',
  'password',
  'paymentmethodtoken',
  'pan',
  'cvv',
  'phone',
  'email',
  'recipientcontact',
  'recipientname',
  'address_ciphertext',
  'recipient_ciphertext',
  'latitude',
  'longitude',
  'coordinates',
]);

function redact(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redact(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (REDACT_KEYS.has(lowerKey)) {
      result[key] = '[REDACTED]';
    } else if (typeof val === 'string' && val.length > 200) {
      result[key] = `${val.slice(0, 50)}...[TRUNCATED ${val.length} chars]`;
    } else {
      result[key] = redact(val, depth + 1);
    }
  }
  return result;
}

export const logger = {
  info(message: string, context?: Record<string, unknown>): void {
    console.log(JSON.stringify({ level: 'info', time: new Date().toISOString(), message, context: redact(context) }));
  },
  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(JSON.stringify({ level: 'warn', time: new Date().toISOString(), message, context: redact(context) }));
  },
  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    const errObj = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error;
    console.error(JSON.stringify({ level: 'error', time: new Date().toISOString(), message, error: errObj, context: redact(context) }));
  },
};
