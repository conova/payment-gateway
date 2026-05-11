import type { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env.js';

export function requireApiKey(expected: 'core' | 'admin') {
  const expectedKey = expected === 'core' ? env.CORE_API_KEY : env.ADMIN_API_KEY;
  return async function (req: FastifyRequest, reply: FastifyReply) {
    const auth = req.headers['authorization'] ?? '';
    const direct = req.headers['x-api-key'];
    let provided: string | undefined;

    if (typeof auth === 'string' && auth.startsWith('ApiKey ')) {
      provided = auth.slice(7).trim();
    } else if (typeof direct === 'string') {
      provided = direct.trim();
    }

    if (!provided || !timingSafeEqual(provided, expectedKey)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
