// src/middleware/organizerAuth.ts
import { MiddlewareHandler } from 'hono';
import { db } from '../db/client';
import { organizers } from '../db/schema';
import { eq } from 'drizzle-orm';

export const organizerAuth: MiddlewareHandler = async (c, next) => {
	try {
		const secretKey = c.req.header('x-secret-key');
		if (!secretKey) return c.json({ error: 'Unauthorized' }, 401);

		const organizerResult = await db.select().from(organizers).where(eq(organizers.secretKey, secretKey)).limit(1).execute();

		const organizer = organizerResult[0];
		if (!organizer) return c.json({ error: 'Unauthorized' }, 401);

		// Attach organizer to context for use in route handlers
		c.set('organizer', organizer);

		await next(); // Continue to the route handler
	} catch (error) {
		console.error('Error validating organizer:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
};
