import { request } from 'undici';
import { negdiConfig, NegdiEndpoint } from '../config/negdi.js';
import { logger } from '../utils/logger.js';
import { verifyOrderSign } from './negdi.verify.js';
import { logEvent } from './events.service.js';
import type {
  NegdiOrderInfo,
  NegdiOrderTypesResponse,
  NegdiResponse,
} from '../types/index.js';

export class NegdiError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly status?: string,
    public readonly detail?: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
  }
}

interface AuthFields {
  terminalid: string;
  username: string;
  password: string;
}

function authFields(): AuthFields {
  return {
    terminalid: negdiConfig.terminalId,
    username: negdiConfig.username,
    password: negdiConfig.password,
  };
}

async function call<TResp>(
  endpoint: NegdiEndpoint,
  body: Record<string, unknown>,
  opts: { tranid?: number } = {},
): Promise<TResp> {
  const url = `${negdiConfig.baseUrl}/${endpoint}`;
  const payload = { ...authFields(), ...body };

  // Sensitive field-уудыг log-д харуулахгүй
  const safeLog = { ...payload, password: '***' };
  await logEvent({
    tranid: opts.tranid,
    endpoint,
    direction: 'out',
    payload: JSON.stringify(safeLog),
  });

  let httpStatus = 0;
  let rawResponse = '';
  try {
    const res = await request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      headersTimeout: negdiConfig.timeoutMs,
      bodyTimeout: negdiConfig.timeoutMs,
    });
    httpStatus = res.statusCode;
    rawResponse = await res.body.text();

    let parsed: TResp;
    try {
      parsed = JSON.parse(rawResponse) as TResp;
    } catch (_) {
      await logEvent({
        tranid: opts.tranid,
        endpoint,
        direction: 'in',
        payload: rawResponse,
        http_status: httpStatus,
        error: 'Invalid JSON',
      });
      throw new NegdiError(
        `NEGDI хариу JSON биш: ${rawResponse.slice(0, 200)}`,
        endpoint,
        undefined,
        undefined,
        httpStatus,
      );
    }

    // Signature шалгах (order + ordersign бүхий хариуд)
    const maybeResp = parsed as unknown as { order?: Record<string, unknown>; ordersign?: string };
    let signatureValid: number | null = null;
    if (maybeResp.order && maybeResp.ordersign) {
      signatureValid = verifyOrderSign(maybeResp.order, maybeResp.ordersign)
        ? 1
        : 0;
    }

    await logEvent({
      tranid: opts.tranid,
      endpoint,
      direction: 'in',
      payload: rawResponse,
      http_status: httpStatus,
      signature_valid: signatureValid,
    });

    if (signatureValid === 0) {
      throw new NegdiError(
        'NEGDI хариуны гарын үсэг буруу (signature mismatch)',
        endpoint,
        undefined,
        undefined,
        httpStatus,
      );
    }

    return parsed;
  } catch (e: unknown) {
    if (e instanceof NegdiError) throw e;
    const err = e as { message?: string; code?: string };
    logger.error(
      { endpoint, code: err.code, msg: err.message },
      'NEGDI call алдаа',
    );
    await logEvent({
      tranid: opts.tranid,
      endpoint,
      direction: 'in',
      payload: rawResponse,
      http_status: httpStatus,
      error: err.message ?? 'Unknown error',
    });
    throw new NegdiError(
      `NEGDI холболтын алдаа: ${err.message ?? 'unknown'}`,
      endpoint,
      undefined,
      undefined,
      httpStatus,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Endpoint helpers
// ─────────────────────────────────────────────────────────────────────────

export interface CreateOrderInput {
  ordertype: '3dsOrder' | 'Non3dsOrder' | 'Non3dsPayment' | '3dsPayment' | 'QPAY';
  amount: number;
  currency: string;
  returnurl?: string;
  ordernum?: string;
  description?: string;
  theme?: 'W' | 'D' | 'B';
  lang?: 'mn' | 'en';
}

export async function createOrder(input: CreateOrderInput): Promise<NegdiResponse> {
  return call<NegdiResponse>(NegdiEndpoint.CREATE_ORDER, {
    ordertype: input.ordertype,
    returnurl: input.returnurl ?? negdiConfig.returnUrl,
    amount: input.amount,
    currency: input.currency,
    ordernum: input.ordernum,
    description: input.description,
    theme: input.theme ?? negdiConfig.defaultTheme,
    lang: input.lang ?? negdiConfig.defaultLang,
  });
}

export interface CreateOrderWithTokenInput extends CreateOrderInput {
  customerid: string;
  customername?: string;
  customerregisterid?: string;
}

export async function createOrderWithToken(
  input: CreateOrderWithTokenInput,
): Promise<NegdiResponse> {
  return call<NegdiResponse>(NegdiEndpoint.CREATE_ORDER_WITH_TOKEN, {
    ordertype: input.ordertype,
    returnurl: input.returnurl ?? negdiConfig.returnUrl,
    amount: input.amount,
    currency: input.currency,
    customerid: input.customerid,
    customername: input.customername,
    ordernum: input.ordernum,
    description: input.description,
    theme: input.theme ?? negdiConfig.defaultTheme,
    lang: input.lang ?? negdiConfig.defaultLang,
  });
}

export interface ChargeTokenInput {
  ordertype: '3dsOrder' | 'Non3dsOrder' | 'Non3dsPayment' | '3dsPayment';
  amount: number;
  currency: string;
  customerid: string;
  tokenid: number;
  returnurl?: string;
  ordernum?: string;
  description?: string;
  theme?: 'W' | 'D' | 'B';
  lang?: 'mn' | 'en';
}

export async function chargeToken(input: ChargeTokenInput): Promise<NegdiResponse> {
  return call<NegdiResponse>(NegdiEndpoint.CHARGE_TOKEN, {
    ordertype: input.ordertype,
    returnurl: input.returnurl ?? negdiConfig.returnUrl,
    amount: input.amount,
    currency: input.currency,
    customerid: input.customerid,
    tokenid: input.tokenid,
    ordernum: input.ordernum,
    description: input.description,
    theme: input.theme ?? negdiConfig.defaultTheme,
    lang: input.lang ?? negdiConfig.defaultLang,
  });
}

export interface ProcessOrderInput {
  tranid: number;
  checkid: string;
  amount: number;
  customerid: string;
  tokenid: number;
}

export async function processOrder(input: ProcessOrderInput): Promise<NegdiResponse> {
  return call<NegdiResponse>(
    NegdiEndpoint.PROCESS_ORDER,
    {
      tranid: input.tranid,
      checkid: input.checkid,
      amount: input.amount,
      customerid: input.customerid,
      tokenid: input.tokenid,
    },
    { tranid: input.tranid },
  );
}

export async function inquiryOrder(
  tranid: number,
  checkid: string,
): Promise<NegdiResponse> {
  return call<NegdiResponse>(
    NegdiEndpoint.INQUIRY_ORDER,
    { tranid, checkid },
    { tranid },
  );
}

export async function cancelOrder(
  tranid: number,
  amount: number,
): Promise<NegdiResponse> {
  return call<NegdiResponse>(
    NegdiEndpoint.CANCEL_ORDER,
    { tranid, amount },
    { tranid },
  );
}

export async function cancelToken(
  customerid: string,
  tokenid: number,
): Promise<NegdiResponse> {
  return call<NegdiResponse>(NegdiEndpoint.CANCEL_TOKEN, {
    customerid,
    tokenid,
  });
}

export async function inquiryOrderTypes(): Promise<NegdiOrderTypesResponse> {
  return call<NegdiOrderTypesResponse>(NegdiEndpoint.INQUIRY_ORDERTYPES, {});
}

export type { NegdiOrderInfo, NegdiResponse };
