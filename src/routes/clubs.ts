// src/routes/clubs.ts
import { Hono } from 'hono';
import { db } from '../db/client';
import { clubs } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { organizerAuth } from '../middleware/organizerAuth';

const app = new Hono();

// Apply middleware to all routes
app.use('*', organizerAuth);

// GET /clubs - list all clubs for the authenticated organizer
app.get('/clubs', async (c) => {
	try {
		const organizer = c.get('organizer'); // already validated
		const clubsList = await db
			.select()
			.from(clubs)
			.where(and(eq(clubs.organizerId, organizer.id), eq(clubs.isActive, true)))
			.execute();

		return c.json({ clubs: clubsList }, 200);
	} catch (error) {
		console.error('Error fetching clubs:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// GET /clubs/:id - detailed view of a single club
app.get('/clubs/:id', async (c) => {
	try {
		const organizer = c.get('organizer');
		const clubId = Number(c.req.param('id'));
		if (isNaN(clubId)) return c.json({ error: 'Invalid club id' }, 400);

		const clubQuery = await db
			.select()
			.from(clubs)
			.where(and(eq(clubs.id, clubId), eq(clubs.organizerId, organizer.id), eq(clubs.isActive, true)))
			.limit(1)
			.execute();

		const club = clubQuery[0];
		if (!club) return c.json({ error: 'Club not found' }, 404);

		return c.json({ club }, 200);
	} catch (error) {
		console.error('Error fetching club:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

export default app;
