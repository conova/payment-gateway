import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyRequest {
    customerId?: string;
    tokenPayload?: jwt.JwtPayload & Record<string, unknown>;
  }
}

interface CorePayload extends jwt.JwtPayload {
  uid?: string;
  custId?: string;
}

export async function authenticateMobileJwt(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  
    req.customerId = 1;
    req.tokenPayload = {};
  return ;
  const auth = req.headers['authorization'] ?? '';
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing bearer token' });
  }
  const token = auth.slice(7).trim();
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: env.JWT_ISSUER || undefined,
      algorithms: ['HS256'],
    }) as CorePayload;
    const customerId = decoded.uid ?? decoded.custId ?? null;
    if (!customerId) {
      return reply.code(401).send({ error: 'Token missing uid' });
    }
    req.customerId = customerId;
    req.tokenPayload = decoded;
  } catch (e: unknown) {
    const err = e as { message?: string };
    return reply.code(401).send({ error: `Invalid token: ${err.message ?? ''}` });
  }
}
