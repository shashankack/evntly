// src/routes/clubs.ts
import { Hono } from 'hono';
import { db } from '../db/client';
import { clubs } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { organizerAuth } from '../middleware/organizerAuth';
import { generateSecureRandomId } from '../utils/idGenerator';

interface Env {
	Variables: {
		organizer: any;
	};
}

const app = new Hono<Env>();

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

// POST /clubs - create a new club
app.post('/clubs', async (c) => {
	try {
		const organizer = c.get('organizer');
		const body = await c.req.json();

		const { name, description, imageUrls, videoUrls } = body;

		if (!name) {
			return c.json({ error: 'Missing required field: name' }, 400);
		}

		const clubId = generateSecureRandomId();

		const [newClub] = await db
			.insert(clubs)
			.values({
				id: clubId,
				organizerId: organizer.id,
				name,
				description: description || null,
				imageUrls: imageUrls || [],
				videoUrls: videoUrls || [],
				isActive: true,
			})
			.returning()
			.execute();

		return c.json({ club: newClub, message: 'Club created successfully' }, 201);
	} catch (error) {
		console.error('Error creating club:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// PUT /clubs/:id - update an existing club
app.put('/clubs/:id', async (c) => {
	try {
		const organizer = c.get('organizer');
		const clubId = Number(c.req.param('id'));
		if (isNaN(clubId)) return c.json({ error: 'Invalid club id' }, 400);

		const body = await c.req.json();

		// Verify club belongs to organizer
		const clubQuery = await db
			.select()
			.from(clubs)
			.where(and(eq(clubs.id, clubId), eq(clubs.organizerId, organizer.id)))
			.limit(1)
			.execute();

		if (!clubQuery[0]) return c.json({ error: 'Club not found' }, 404);

		// Build update object
		const updateData: any = {
			updatedAt: new Date(),
		};

		if (body.name !== undefined) updateData.name = body.name;
		if (body.description !== undefined) updateData.description = body.description;
		if (body.imageUrls !== undefined) updateData.imageUrls = body.imageUrls;
		if (body.videoUrls !== undefined) updateData.videoUrls = body.videoUrls;
		if (body.isActive !== undefined) updateData.isActive = body.isActive;

		const [updatedClub] = await db
			.update(clubs)
			.set(updateData)
			.where(eq(clubs.id, clubId))
			.returning()
			.execute();

		return c.json({ club: updatedClub, message: 'Club updated successfully' }, 200);
	} catch (error) {
		console.error('Error updating club:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// DELETE /clubs/:id - soft delete a club
app.delete('/clubs/:id', async (c) => {
	try {
		const organizer = c.get('organizer');
		const clubId = Number(c.req.param('id'));
		if (isNaN(clubId)) return c.json({ error: 'Invalid club id' }, 400);

		// Verify club belongs to organizer
		const clubQuery = await db
			.select()
			.from(clubs)
			.where(and(eq(clubs.id, clubId), eq(clubs.organizerId, organizer.id)))
			.limit(1)
			.execute();

		if (!clubQuery[0]) return c.json({ error: 'Club not found' }, 404);

		// Soft delete
		await db
			.update(clubs)
			.set({
				isActive: false,
				deletedAt: new Date(),
			})
			.where(eq(clubs.id, clubId))
			.execute();

		return c.json({ message: 'Club deleted successfully' }, 200);
	} catch (error) {
		console.error('Error deleting club:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

export default app;
