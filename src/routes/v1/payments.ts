import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticateMobileJwt } from '../../middleware/jwt.js';
import {
  initPayment,
  refreshOrder,
  getOrder,
  cancelOrderById,
  processPayment,
} from '../../services/orders.service.js';
import { NegdiError } from '../../services/negdi.client.js';
import { logger } from '../../utils/logger.js';

const initSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  description: z.string().max(255).optional(),
  ordernum: z.string().max(20).optional(),
  kind: z.enum(['card', 'qpay', 'save_card', 'token']),
  customer_name: z.string().max(255).optional(),
  customer_register_id: z.string().max(32).optional(),
  tokenid: z.number().int().positive().optional(),
  return_url: z.string().url().optional(),
  theme: z.enum(['W', 'D', 'B']).optional(),
  lang: z.enum(['mn', 'en']).optional(),
});

const processSchema = z.object({
  tranid: z.number().int().positive(),
  checkid: z.string().min(1),
  amount: z.number().positive(),
  tokenid: z.number().int().positive(),
});

const cancelSchema = z.object({
  amount: z.number().positive(),
});

const tranidParam = z.object({
  tranid: z.coerce.number().int().positive(),
});

const inquiryQuery = z.object({
  checkid: z.string().min(1),
});

export const mobilePaymentsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticateMobileJwt);

  /** Төлбөр эхлүүлэх */
  app.post('/', async (req, reply) => {
    const parsed = initSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const result = await initPayment({
        ...parsed.data,
        customer_id: req.customerId!,
      });
      return reply.send(result);
    } catch (e: unknown) {
      return handleError(reply, e);
    }
  });

  /** 3DS authentication-ы дараа process хийх */
  app.post('/process', async (req, reply) => {
    const parsed = processSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const result = await processPayment(
        parsed.data.tranid,
        parsed.data.checkid,
        parsed.data.amount,
        req.customerId!,
        parsed.data.tokenid,
      );
      return reply.send(result);
    } catch (e: unknown) {
      return handleError(reply, e);
    }
  });

  /** Захиалгын мэдээлэл / status авах (NEGDI-аас дахин татна) */
  app.get('/:tranid', async (req, reply) => {
    const paramParsed = tranidParam.safeParse(req.params);
    const queryParsed = inquiryQuery.safeParse(req.query);
    if (!paramParsed.success || !queryParsed.success) {
      return reply.code(400).send({
        error: {
          ...paramParsed.error?.flatten(),
          ...queryParsed.error?.flatten(),
        },
      });
    }

    const localOrder = await getOrder(paramParsed.data.tranid);
    if (!localOrder) {
      return reply.code(404).send({ error: 'Order олдсонгүй' });
    }
    if (localOrder.customer_id !== req.customerId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    try {
      const refreshed = await refreshOrder(
        paramParsed.data.tranid,
        queryParsed.data.checkid,
      );
      return reply.send(refreshed ?? localOrder);
    } catch (e: unknown) {
      return handleError(reply, e);
    }
  });

  /** Захиалгыг цуцлах */
  app.post('/:tranid/cancel', async (req, reply) => {
    const paramParsed = tranidParam.safeParse(req.params);
    const bodyParsed = cancelSchema.safeParse(req.body);
    if (!paramParsed.success || !bodyParsed.success) {
      return reply.code(400).send({
        error: {
          ...paramParsed.error?.flatten(),
          ...bodyParsed.error?.flatten(),
        },
      });
    }

    const localOrder = await getOrder(paramParsed.data.tranid);
    if (!localOrder) {
      return reply.code(404).send({ error: 'Order олдсонгүй' });
    }
    if (localOrder.customer_id !== req.customerId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    try {
      const status = await cancelOrderById(
        paramParsed.data.tranid,
        bodyParsed.data.amount,
      );
      return reply.send({ status });
    } catch (e: unknown) {
      return handleError(reply, e);
    }
  });
};

function handleError(reply: import('fastify').FastifyReply, e: unknown) {
  if (e instanceof NegdiError) {
    logger.warn({ endpoint: e.endpoint, msg: e.message }, 'NEGDI алдаа');
    return reply.code(e.httpStatus && e.httpStatus >= 500 ? 502 : 400).send({
      error: e.message,
      detail: e.detail,
      status: e.status,
    });
  }
  const err = e as { message?: string };
  logger.error({ err: e }, 'Payment route алдаа');
  return reply.code(500).send({ error: err.message ?? 'Internal error' });
}
