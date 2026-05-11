import { withConnection, oracledb } from '../config/oracle.js';
import {
  createOrder,
  createOrderWithToken,
  chargeToken,
  processOrder,
  inquiryOrder,
  cancelOrder as negdiCancelOrder,
  cancelToken as negdiCancelToken,
} from './negdi.client.js';
import { upsertToken, markTokenCancelled } from './tokens.service.js';
import type {
  NegdiOrderInfo,
  NegdiResponse,
  OrderType,
  PaymentOrderRow,
} from '../types/index.js';

// ──────────────────────────────────────────────────────────────────────────
// DB persist
// ──────────────────────────────────────────────────────────────────────────

interface InsertOrderInput {
  tranid: number;
  checkid: string;
  customer_id: string;
  ordertype: OrderType;
  amount: number;
  currency: string;
  ordernum?: string;
  description?: string;
  status: string;
  negdiurl?: string;
  return_url?: string;
  tokenid?: number | null;
}

async function insertOrder(input: InsertOrderInput): Promise<number> {
  return withConnection(async (conn) => {
    const result = await conn.execute<{ ID?: number[] | number }>(
      `INSERT INTO payment_orders
         (tranid, checkid, customer_id, ordertype, amount, currency,
          ordernum, description, status, negdiurl, return_url, tokenid)
       VALUES
         (:tranid, :checkid, :customer_id, :ordertype, :amount, :currency,
          :ordernum, :description, :status, :negdiurl, :return_url, :tokenid)
       RETURNING id INTO :id`,
      {
        tranid: input.tranid,
        checkid: input.checkid,
        customer_id: input.customer_id,
        ordertype: input.ordertype,
        amount: input.amount,
        currency: input.currency,
        ordernum: input.ordernum ?? null,
        description: input.description ?? null,
        status: input.status,
        negdiurl: input.negdiurl ?? null,
        return_url: input.return_url ?? null,
        tokenid: input.tokenid ?? null,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
    );
    return (result.outBinds as { id: number[] }).id[0]!;
  });
}

/** Hариунаас (inquiry эсвэл process) status, payment_method, brand, token-уудыг шинэчилнэ */
async function syncOrderFromNegdi(order: NegdiOrderInfo): Promise<void> {
  if (!order.tranid) return;
  await withConnection(async (conn) => {
    await conn.execute(
      `UPDATE payment_orders SET
         status = COALESCE(:status, status),
         approval_code = COALESCE(:approval_code, approval_code),
         payment_method = COALESCE(:payment_method, payment_method),
         bankname = COALESCE(:bankname, bankname),
         brand = COALESCE(:brand, brand),
         masked_pan = COALESCE(:masked_pan, masked_pan),
         tokenid = COALESCE(:tokenid, tokenid),
         last_inquiry_at = SYSTIMESTAMP,
         updated_at = SYSTIMESTAMP
       WHERE tranid = :tranid`,
      {
        tranid: order.tranid,
        status: order.status,
        approval_code: order.approvalCode ?? null,
        payment_method: order.paymentmethod ?? null,
        bankname: order.token?.bankname ?? null,
        brand: order.token?.brand ?? null,
        masked_pan: order.token?.maskedpan ?? null,
        tokenid: order.token?.tokenid ?? null,
      },
    );
  });

  if (order.token?.tokenid && order.customer?.customerid) {
    await upsertToken({
      tokenid: order.token.tokenid,
      customer_id: order.customer.customerid,
      customer_name: order.customer.customername,
      customer_register_id: order.customer.customerregisterid,
      masked_pan: order.token.maskedpan,
      brand: order.token.brand,
      bankname: order.token.bankname,
      exp_date: order.token.expdate,
      status: order.token.status,
      registered_at: order.token.regtime,
    });
  }
}

function rowToOrder(row: Record<string, unknown>): PaymentOrderRow {
  return {
    id: Number(row.ID),
    tranid: Number(row.TRANID),
    checkid: String(row.CHECKID),
    customer_id: String(row.CUSTOMER_ID),
    ordertype: String(row.ORDERTYPE) as OrderType,
    amount: Number(row.AMOUNT),
    currency: String(row.CURRENCY),
    ordernum: (row.ORDERNUM as string) ?? null,
    description: (row.DESCRIPTION as string) ?? null,
    status: String(row.STATUS),
    approval_code: (row.APPROVAL_CODE as string) ?? null,
    payment_method: (row.PAYMENT_METHOD as string) ?? null,
    bankname: (row.BANKNAME as string) ?? null,
    brand: (row.BRAND as string) ?? null,
    masked_pan: (row.MASKED_PAN as string) ?? null,
    tokenid: row.TOKENID == null ? null : Number(row.TOKENID),
    return_url: (row.RETURN_URL as string) ?? null,
    negdiurl: (row.NEGDIURL as string) ?? null,
    regtime: row.REGTIME ? new Date(row.REGTIME as Date).toISOString() : null,
    last_inquiry_at: row.LAST_INQUIRY_AT
      ? new Date(row.LAST_INQUIRY_AT as Date).toISOString()
      : null,
    created_at: new Date(row.CREATED_AT as Date).toISOString(),
    updated_at: new Date(row.UPDATED_AT as Date).toISOString(),
  };
}

export async function getOrder(tranid: number): Promise<PaymentOrderRow | null> {
  return withConnection(async (conn) => {
    const result = await conn.execute<Record<string, unknown>>(
      `SELECT id, tranid, checkid, customer_id, ordertype, amount, currency,
              ordernum, description, status, approval_code, payment_method,
              bankname, brand, masked_pan, tokenid, return_url, negdiurl,
              regtime, last_inquiry_at, created_at, updated_at
         FROM payment_orders WHERE tranid = :tranid`,
      { tranid },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const rows = result.rows ?? [];
    if (rows.length === 0) return null;
    return rowToOrder(rows[0]!);
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Use-cases
// ──────────────────────────────────────────────────────────────────────────

export interface InitPaymentInput {
  customer_id: string;
  amount: number;
  currency?: string;
  description?: string;
  ordernum?: string;
  /**
   * Mobile-аас ирэх "төрөл" — серверт NEGDI ordertype-ыг шийднэ.
   *   card       — 3dsOrder (одоо ингэж л зөвхөн ажиллана)
   *   qpay       — QPAY
   *   save_card  — 3dsOrder, token бүртгэх (customer_name, register заавал)
   *   token      — 3dsOrder, одоо байгаа token-аар (tokenid заавал)
   */
  kind: 'card' | 'qpay' | 'save_card' | 'token';
  customer_name?: string;
  customer_register_id?: string;
  tokenid?: number;
  return_url?: string;
  theme?: 'W' | 'D' | 'B';
  lang?: 'mn' | 'en';
}

export interface InitPaymentResult {
  tranid: number;
  checkid: string;
  status: string;
  redirect_url?: string;
  approval_code?: string;
  detail?: string;
}

/**
 * Mobile-аас "төлбөр эхлүүл" гэх запрос ирэхэд:
 *   1. Тохирох NEGDI endpoint-руу зурвас илгээнэ (ec1000/1001/1002)
 *   2. Хариуны order-г DB-д хадгална
 *   3. Mobile-руу tranid + redirect_url буцаана
 */
export async function initPayment(
  input: InitPaymentInput,
): Promise<InitPaymentResult> {
  const currency = input.currency ?? 'MNT';

  let negdiResp: NegdiResponse;
  let ordertype: OrderType;

  switch (input.kind) {
    case 'card': {
      ordertype = '3dsOrder';
      negdiResp = await createOrder({
        ordertype,
        amount: input.amount,
        currency,
        ordernum: input.ordernum,
        description: input.description,
        returnurl: input.return_url,
        theme: input.theme,
        lang: input.lang,
      });
      break;
    }
    case 'qpay': {
      ordertype = 'QPAY';
      negdiResp = await createOrder({
        ordertype,
        amount: input.amount,
        currency,
        ordernum: input.ordernum,
        description: input.description,
        returnurl: input.return_url,
        theme: input.theme,
        lang: input.lang,
      });
      break;
    }
    case 'save_card': {
      if (!input.customer_id) {
        throw new Error('customer_id шаардлагатай (save_card)');
      }
      ordertype = '3dsOrder';
      negdiResp = await createOrderWithToken({
        ordertype,
        amount: input.amount,
        currency,
        customerid: input.customer_id,
        customername: input.customer_name,
        ordernum: input.ordernum,
        description: input.description,
        returnurl: input.return_url,
        theme: input.theme,
        lang: input.lang,
      });
      break;
    }
    case 'token': {
      if (!input.tokenid) throw new Error('tokenid шаардлагатай (token)');
      ordertype = '3dsOrder';
      negdiResp = await chargeToken({
        ordertype,
        amount: input.amount,
        currency,
        customerid: input.customer_id,
        tokenid: input.tokenid,
        ordernum: input.ordernum,
        description: input.description,
        returnurl: input.return_url,
        theme: input.theme,
        lang: input.lang,
      });
      break;
    }
  }

  const o = negdiResp.order;
  if (!o.tranid || !o.checkid) {
    throw new Error(
      `NEGDI хариунаас tranid/checkid олдсонгүй (status=${o.status}, errors=${o.errors ?? ''})`,
    );
  }

  await insertOrder({
    tranid: o.tranid,
    checkid: o.checkid,
    customer_id: input.customer_id,
    ordertype,
    amount: input.amount,
    currency,
    ordernum: input.ordernum,
    description: input.description,
    status: o.status,
    negdiurl: o.negdiurl,
    return_url: input.return_url,
    tokenid: input.tokenid ?? null,
  });

  return {
    tranid: o.tranid,
    checkid: o.checkid,
    status: o.status,
    redirect_url: o.negdiurl,
    approval_code: o.approvalCode,
    detail: o.detail,
  };
}

/**
 * 3DS authentication-ий дараа ec1003-аар захиалга гүйцэтгэнэ.
 */
export async function processPayment(
  tranid: number,
  checkid: string,
  amount: number,
  customer_id: string,
  tokenid: number,
): Promise<InitPaymentResult> {
  const resp = await processOrder({ tranid, checkid, amount, customerid: customer_id, tokenid });
  const o = resp.order;
  await syncOrderFromNegdi(o);
  return {
    tranid: o.tranid ?? tranid,
    checkid: o.checkid ?? checkid,
    status: o.status,
    approval_code: o.approvalCode,
    detail: o.detail,
  };
}

/**
 * Inquiry — NEGDI-аас одоогийн status татаж DB-г шинэчилнэ.
 */
export async function refreshOrder(
  tranid: number,
  checkid: string,
): Promise<PaymentOrderRow | null> {
  const resp = await inquiryOrder(tranid, checkid);
  await syncOrderFromNegdi(resp.order);
  return getOrder(tranid);
}

/** Cancel order — NEGDI ec1099 + local sync */
export async function cancelOrderById(
  tranid: number,
  amount: number,
): Promise<string> {
  const resp = await negdiCancelOrder(tranid, amount);
  await syncOrderFromNegdi(resp.order);
  return resp.order.status;
}

/** Cancel token */
export async function cancelTokenById(
  customer_id: string,
  tokenid: number,
): Promise<string> {
  const resp = await negdiCancelToken(customer_id, tokenid);
  if (resp.order.status === 'Approved') {
    await markTokenCancelled(tokenid);
  }
  return resp.order.status;
}
