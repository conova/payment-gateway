export type OrderType =
  | '3dsOrder'
  | 'Non3dsOrder'
  | 'Non3dsPayment'
  | '3dsPayment'
  | 'QPAY';

/** NEGDI Status (PDF section 10) — гадуур нь ангилсан */
export type NegdiStatus =
  | 'Preparing'
  | 'Transaction expected'
  | 'Approved'
  | 'Authorized'
  | 'Partially paid'
  | 'Funded'
  | 'Fully paid'
  | 'Expired'
  | 'Reversed'
  | 'Cancelled'
  | 'Rejected'
  | 'Refused'
  | 'Closed'
  | 'Declined'
  | 'System error';

export interface NegdiOrderInfo {
  tranid?: number;
  checkid?: string;
  status: NegdiStatus | string;
  negdiurl?: string;
  detail?: string;
  errors?: string;
  ordertype?: string;
  paymentmethod?: string;
  approvalCode?: string;
  amount?: number;
  currency?: string;
  ordernum?: string;
  description?: string;
  regtime?: string;
  customer?: {
    customerid?: string;
    customername?: string;
    customerregisterid?: string;
  };
  token?: {
    tokenid?: number;
    regtime?: string;
    status?: string;
    maskedpan?: string;
    expdate?: string;
    brand?: string;
    bankname?: string;
  };
}

export interface NegdiResponse {
  order: NegdiOrderInfo;
  ordersign: string;
}

export interface NegdiOrderTypesResponse {
  order: {
    status: NegdiStatus | string;
    ordertypes?: Array<{
      ordertype: string;
      title?: string;
      allowvoid?: boolean;
    }>;
    detail?: string;
    errors?: string;
  };
  ordersign: string;
}

// DB row-ууд
export interface PaymentOrderRow {
  id: number;
  tranid: number;
  checkid: string;
  customer_id: string;
  ordertype: OrderType | string;
  amount: number;
  currency: string;
  ordernum: string | null;
  description: string | null;
  status: string;
  approval_code: string | null;
  payment_method: string | null;
  bankname: string | null;
  brand: string | null;
  masked_pan: string | null;
  tokenid: number | null;
  return_url: string | null;
  negdiurl: string | null;
  regtime: string | null;
  last_inquiry_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentTokenRow {
  tokenid: number;
  customer_id: string;
  customer_name: string | null;
  customer_register_id: string | null;
  masked_pan: string | null;
  brand: string | null;
  bankname: string | null;
  exp_date: string | null;
  status: string;
  registered_at: string | null;
  created_at: string;
  updated_at: string;
}
