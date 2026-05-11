import { env } from './env.js';

/**
 * NEGDI ecommerce-ийн ил үзэгдэх public key (PDF баримтаас).
 * NEGDI өөрчилсөн тохиолдолд .env-ээс `NEGDI_PUBLIC_KEY`-аар override хий.
 */
const NEGDI_PUBLIC_KEY_DEFAULT = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4OmScz6Xo5bxSDAjfkRd
C5yYIkceauCMQBlpa8u3IMORrvX8YvgpDMv5nvFcVT4f6IlarYFkX7DDXbwMlSTg
Xga/aDmfSx3MubpGV8ln3HCiXKeqMI0A73ww5BLMA++aD3xKm6iJVHOvD4PK0C1g
7KnYJingOpwLH7GGDG63XFvMsFR5A00jCDdruO17AXZdfdHVZVhRxB0GaqehtHlU
WlzqXfZ9KR2eZcloqPIIaSx2EFFcJfp8Wh4gZt2IJmhrfZPEZ5VTafHGmgI7yZcL
qYcj1CDyBY5audAVojnYfGpyH24cPjTFeFM1Ab8LaW7F9HUc1BSPMQHm6kpVxc8E
RwIDAQAB
-----END PUBLIC KEY-----`;

export const negdiConfig = {
  baseUrl: env.NEGDI_BASE_URL,
  terminalId: env.NEGDI_TERMINAL_ID,
  username: env.NEGDI_USERNAME,
  password: env.NEGDI_PASSWORD,
  returnUrl: env.NEGDI_RETURN_URL,
  defaultTheme: env.NEGDI_DEFAULT_THEME,
  defaultLang: env.NEGDI_DEFAULT_LANG,
  publicKey: env.NEGDI_PUBLIC_KEY ?? NEGDI_PUBLIC_KEY_DEFAULT,
  timeoutMs: env.NEGDI_TIMEOUT_MS,
};

/** NEGDI endpoint-уудын тогтмол кодууд */
export const NegdiEndpoint = {
  /** Create order (no token) */
  CREATE_ORDER: 'ec1000',
  /** Create order with token registration */
  CREATE_ORDER_WITH_TOKEN: 'ec1001',
  /** Create order using existing token */
  CHARGE_TOKEN: 'ec1002',
  /** Process 3DS order (after authentication) */
  PROCESS_ORDER: 'ec1003',
  /** Inquiry order type list */
  INQUIRY_ORDERTYPES: 'ec1096',
  /** Cancel token */
  CANCEL_TOKEN: 'ec1097',
  /** Inquiry order */
  INQUIRY_ORDER: 'ec1098',
  /** Cancel order */
  CANCEL_ORDER: 'ec1099',
} as const;
export type NegdiEndpoint = (typeof NegdiEndpoint)[keyof typeof NegdiEndpoint];
