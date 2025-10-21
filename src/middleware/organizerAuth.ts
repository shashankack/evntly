// src/middleware/organizerAuth.ts
import { MiddlewareHandler } from 'hono';
import { db } from '../db/client';
import { organizers } from '../db/schema';
import { eq } from 'drizzle-orm';
import { verifyToken } from '../utils/jwt';

export const organizerAuth: MiddlewareHandler = async (c, next) => {
	try {
		const secretKey = c.req.header('x-secret-key');
		if (!secretKey) return c.json({ error: 'Unauthorized: Missing secret key' }, 401);

		// Verify JWT token
		const payload = verifyToken(secretKey);
		if (!payload) return c.json({ error: 'Unauthorized: Invalid or expired token' }, 401);

		// Fetch organizer from database to ensure they still exist and are active
		const organizerResult = await db
			.select()
			.from(organizers)
			.where(eq(organizers.id, payload.organizerId))
			.limit(1)
			.execute();

		const organizer = organizerResult[0];
		if (!organizer || !organizer.isActive) {
			return c.json({ error: 'Unauthorized: Organizer not found or inactive' }, 401);
		}

		// Verify the token in DB matches (in case of manual invalidation)
		if (organizer.secretKey !== secretKey) {
			return c.json({ error: 'Unauthorized: Token has been rotated' }, 401);
		}

		// Attach organizer to context for use in route handlers
		c.set('organizer', organizer);

		await next(); // Continue to the route handler
	} catch (error) {
		console.error('Error validating organizer:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
};
