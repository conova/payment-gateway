import { withConnection } from '../config/oracle.js';
import { logger } from '../utils/logger.js';

export interface PaymentEvent {
  tranid?: number;
  endpoint: string;
  direction: 'out' | 'in';
  payload: string;
  http_status?: number;
  signature_valid?: number | null;
  error?: string;
}

/**
 * Бүх NEGDI API call-ын audit. Алдаа гарвал зөвхөн log-д бичээд continue.
 * (audit алдаагаар бизнес flow-г зогсоохгүй.)
 */
export async function logEvent(event: PaymentEvent): Promise<void> {
  try {
    await withConnection(async (conn) => {
      await conn.execute(
        `INSERT INTO payment_events
           (tranid, endpoint, direction, payload, http_status,
            signature_valid, error)
         VALUES
           (:tranid, :endpoint, :direction, :payload, :http_status,
            :signature_valid, :error)`,
        {
          tranid: event.tranid ?? null,
          endpoint: event.endpoint,
          direction: event.direction,
          payload: event.payload.slice(0, 4000), // CLOB-д хязгаар бичих
          http_status: event.http_status ?? null,
          signature_valid: event.signature_valid ?? null,
          error: event.error ?? null,
        },
      );
    });
  } catch (e) {
    logger.warn({ err: e }, 'logEvent алдаа (continue)');
  }
}
