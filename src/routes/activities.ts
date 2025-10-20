// src/routes/activities.ts
import { Hono } from 'hono';
import { db } from '../db/client';
import { organizers, clubs, activities } from '../db/schema';
import { eq, and, inArray, asc, desc } from 'drizzle-orm';
import { organizerAuth } from '../middleware/organizerAuth';

const app = new Hono();

app.use('*', organizerAuth);

// -----------------------------
// GET /activities
// List all activities for the organizer
// Supports query filters, pagination, and sorting
// -----------------------------
app.get('/activities', async (c) => {
	try {
		const organizer = c.get('organizer');

		// Extract query parameters
		const { status, type, clubId, page = '1', limit = '10', sortBy = 'createdAt', order = 'desc' } = c.req.query();

		// Get all clubs for this organizer
		const organizerClubs = await db.select().from(clubs).where(eq(clubs.organizerId, organizer.id)).execute();

		let clubIds = organizerClubs.map((club) => club.id);

		if (clubId) {
			const clubNum = Number(clubId);
			if (!clubIds.includes(clubNum)) return c.json({ activities: [] });
			clubIds = [clubNum];
		}

		// Dynamic filter conditions
		const conditions = [inArray(activities.clubId, clubIds)];
		const validStatuses = ['active', 'canceled', 'completed', 'upcoming', 'live'] as const;
		if (status && validStatuses.includes(status as (typeof validStatuses)[number]))
			conditions.push(eq(activities.status, status as (typeof validStatuses)[number]));
		if (type) conditions.push(eq(activities.type, type));

		// Pagination
		const pageNum = Math.max(Number(page), 1);
		const limitNum = Math.min(Number(limit), 100); // max 100 per page
		const offset = (pageNum - 1) * limitNum;

		// Sorting
		const sortMap: Record<string, any> = {
			createdAt: activities.createdAt,
		};
		const sortColumn = sortMap[sortBy] || activities.createdAt; // fallback to createdAt
		const sortOrder = order.toLowerCase() === 'asc' ? asc(sortColumn) : desc(sortColumn);

		const activitiesList = await db
			.select()
			.from(activities)
			.where(and(...conditions))
			.orderBy(sortOrder)
			.limit(limitNum)
			.offset(offset)
			.execute();

		return c.json({ activities: activitiesList }, 200);
	} catch (error) {
		console.error('Error fetching activities:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// -----------------------------
// GET /activities/:id
// Get detailed info of a single activity
// -----------------------------
app.get('/activities/:id', async (c) => {
	try {
		const organizer = c.get('organizer');

		const activityId = Number(c.req.param('id'));
		if (isNaN(activityId)) return c.json({ error: 'Invalid activity id' }, 400);

		// Ensure the activity belongs to this organizer
		const activityQuery = await db
			.select()
			.from(activities)
			.innerJoin(clubs, eq(clubs.id, activities.clubId))
			.where(and(eq(activities.id, activityId), eq(clubs.organizerId, organizer.id)))
			.limit(1)
			.execute();

		const activity = activityQuery[0];
		if (!activity) return c.json({ error: 'Activity not found' }, 404);

		return c.json({ activity }, 200);
	} catch (error) {
		console.error('Error fetching activity:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

export default app;
