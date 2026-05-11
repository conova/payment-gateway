import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticateMobileJwt } from '../../middleware/jwt.js';
import { getCustomerTokens, getToken } from '../../services/tokens.service.js';
import { cancelTokenById } from '../../services/orders.service.js';
import { NegdiError } from '../../services/negdi.client.js';

const tokenIdParam = z.object({
  tokenid: z.coerce.number().int().positive(),
});

export const mobileTokensRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticateMobileJwt);

  /** Тухайн customer-ын хадгалсан карт-уудыг харах */
  app.get('/', async (req, reply) => {
    const tokens = await getCustomerTokens(req.customerId!);
    return reply.send({ data: tokens, count: tokens.length });
  });

  /** Карт-ыг устгах (NEGDI ec1097) */
  app.delete('/:tokenid', async (req, reply) => {
    const parsed = tokenIdParam.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const token = await getToken(parsed.data.tokenid);
    if (!token) {
      return reply.code(404).send({ error: 'Token олдсонгүй' });
    }
    if (token.customer_id !== req.customerId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    try {
      const status = await cancelTokenById(req.customerId!, parsed.data.tokenid);
      return reply.send({ status });
    } catch (e: unknown) {
      if (e instanceof NegdiError) {
        return reply.code(400).send({ error: e.message, detail: e.detail });
      }
      const err = e as { message?: string };
      return reply.code(500).send({ error: err.message ?? 'Internal error' });
    }
  });
};
