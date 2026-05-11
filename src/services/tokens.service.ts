import { withConnection, oracledb } from '../config/oracle.js';
import type { PaymentTokenRow } from '../types/index.js';

function rowToToken(row: Record<string, unknown>): PaymentTokenRow {
  return {
    tokenid: Number(row.TOKENID),
    customer_id: String(row.CUSTOMER_ID),
    customer_name: (row.CUSTOMER_NAME as string) ?? null,
    customer_register_id: (row.CUSTOMER_REGISTER_ID as string) ?? null,
    masked_pan: (row.MASKED_PAN as string) ?? null,
    brand: (row.BRAND as string) ?? null,
    bankname: (row.BANKNAME as string) ?? null,
    exp_date: (row.EXP_DATE as string) ?? null,
    status: String(row.STATUS),
    registered_at: row.REGISTERED_AT
      ? new Date(row.REGISTERED_AT as Date).toISOString()
      : null,
    created_at: new Date(row.CREATED_AT as Date).toISOString(),
    updated_at: new Date(row.UPDATED_AT as Date).toISOString(),
  };
}

export interface UpsertTokenInput {
  tokenid: number;
  customer_id: string;
  customer_name?: string | null;
  customer_register_id?: string | null;
  masked_pan?: string | null;
  brand?: string | null;
  bankname?: string | null;
  exp_date?: string | null;
  status?: string;
  registered_at?: string | null;
}

/** Token-ийг UPSERT хийнэ (хариунаас token info ирэх бүрд) */
export async function upsertToken(input: UpsertTokenInput): Promise<void> {
  await withConnection(async (conn) => {
    await conn.execute(
      `MERGE INTO payment_tokens t
       USING (SELECT :tokenid AS tokenid FROM dual) src
       ON (t.tokenid = src.tokenid)
       WHEN MATCHED THEN UPDATE SET
         customer_id = :customer_id,
         customer_name = COALESCE(:customer_name, t.customer_name),
         customer_register_id = COALESCE(:customer_register_id, t.customer_register_id),
         masked_pan = COALESCE(:masked_pan, t.masked_pan),
         brand = COALESCE(:brand, t.brand),
         bankname = COALESCE(:bankname, t.bankname),
         exp_date = COALESCE(:exp_date, t.exp_date),
         status = COALESCE(:status, t.status),
         registered_at = COALESCE(:registered_at, t.registered_at),
         updated_at = SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT
         (tokenid, customer_id, customer_name, customer_register_id,
          masked_pan, brand, bankname, exp_date, status, registered_at)
       VALUES
         (:tokenid, :customer_id, :customer_name, :customer_register_id,
          :masked_pan, :brand, :bankname, :exp_date,
          COALESCE(:status, 'Active'),
          CASE WHEN :registered_at IS NULL THEN NULL ELSE TO_TIMESTAMP(:registered_at, 'YYYY-MM-DD"T"HH24:MI:SS.FF') END)`,
      {
        tokenid: input.tokenid,
        customer_id: input.customer_id,
        customer_name: input.customer_name ?? null,
        customer_register_id: input.customer_register_id ?? null,
        masked_pan: input.masked_pan ?? null,
        brand: input.brand ?? null,
        bankname: input.bankname ?? null,
        exp_date: input.exp_date ?? null,
        status: input.status ?? null,
        registered_at: input.registered_at ?? null,
      },
    );
  });
}

export async function getCustomerTokens(
  customerId: string,
): Promise<PaymentTokenRow[]> {
  return withConnection(async (conn) => {
    const result = await conn.execute<Record<string, unknown>>(
      `SELECT tokenid, customer_id, customer_name, customer_register_id,
              masked_pan, brand, bankname, exp_date, status, registered_at,
              created_at, updated_at
         FROM payment_tokens
        WHERE customer_id = :customer_id AND status = 'Active'
        ORDER BY updated_at DESC`,
      { customer_id: customerId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return (result.rows ?? []).map(rowToToken);
  });
}

export async function getToken(
  tokenid: number,
): Promise<PaymentTokenRow | null> {
  return withConnection(async (conn) => {
    const result = await conn.execute<Record<string, unknown>>(
      `SELECT tokenid, customer_id, customer_name, customer_register_id,
              masked_pan, brand, bankname, exp_date, status, registered_at,
              created_at, updated_at
         FROM payment_tokens
        WHERE tokenid = :tokenid`,
      { tokenid },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const rows = result.rows ?? [];
    if (rows.length === 0) return null;
    return rowToToken(rows[0]!);
  });
}

export async function markTokenCancelled(tokenid: number): Promise<void> {
  await withConnection(async (conn) => {
    await conn.execute(
      `UPDATE payment_tokens
          SET status = 'Cancelled', updated_at = SYSTIMESTAMP
        WHERE tokenid = :tokenid`,
      { tokenid },
    );
  });
}
