import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireApiKey } from '../../middleware/apiKey.js';
import { refreshOrder, getOrder, cancelOrderById } from '../../services/orders.service.js';
import { inquiryOrderTypes } from '../../services/negdi.client.js';

const inquirySchema = z.object({
  tranid: z.number().int().positive(),
  checkid: z.string().min(1),
});

const cancelSchema = z.object({
  tranid: z.number().int().positive(),
  amount: z.number().positive(),
});

export const internalPaymentsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireApiKey('core'));

  /** Core нь захиалгын одоогийн статусыг асуух */
  app.post('/inquiry', async (req, reply) => {
    const parsed = inquirySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const refreshed = await refreshOrder(parsed.data.tranid, parsed.data.checkid);
    if (!refreshed) {
      const local = await getOrder(parsed.data.tranid);
      if (!local) return reply.code(404).send({ error: 'Order олдсонгүй' });
      return reply.send(local);
    }
    return reply.send(refreshed);
  });

  /** Core зайлшгүй цуцлах хэрэгцээ — fraud, manual чарга гэх мэт */
  app.post('/cancel', async (req, reply) => {
    const parsed = cancelSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const status = await cancelOrderById(parsed.data.tranid, parsed.data.amount);
    return reply.send({ status });
  });

  /** NEGDI-аас одоо боломжтой ordertype-уудыг авах (cache-д ашиглах) */
  app.get('/ordertypes', async (_req, reply) => {
    const resp = await inquiryOrderTypes();
    return reply.send({
      status: resp.order.status,
      ordertypes: resp.order.ordertypes ?? [],
    });
  });
};
