import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { generateGuestSecret, hashGuestSecret, type GuestSession } from '@arrival/contracts';
import type { IGuestSessionRepository } from '../repositories/interfaces.js';

export async function guestSessionRoutes(fastify: FastifyInstance, opts: { guestRepo: IGuestSessionRepository }) {
  fastify.post('/v1/guest-sessions', async (_request, reply) => {
    const rawSecret = generateGuestSecret();
    const digest = hashGuestSecret(rawSecret);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    await opts.guestRepo.createSession({
      id: randomUUID(),
      tokenDigest: digest,
      createdAt: new Date().toISOString(),
      expiresAt,
    });

    const session: GuestSession = {
      sessionToken: rawSecret,
      expiresAt,
    };

    return reply.status(201).send(session);
  });
}
