// src/routes/clubs.ts
import { Hono } from 'hono';
import { db } from '../db/client';
import { clubs } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { originResolver } from '../middleware/originResolver';
import { generateSecureRandomId } from '../utils/idGenerator';

interface Env {
	Variables: {
		organizer: any;
	};
}

const app = new Hono<Env>();

// Use domain-based authentication for all routes
app.use('*', originResolver);

// Helper to omit id and organizerId from club
function omitClubIds(club: Record<string, any>) {
	if (!club) return club;
	const { id, organizerId, ...rest } = club;
	return rest;
}
// GET /clubs - list all clubs for the organizer
app.get('/clubs', async (c) => {
	try {
		const organizer = c.get('organizer');
		if (!organizer) {
			return c.json({ error: 'No organizer found for this domain' }, 404);
		}
		const clubsList = await db
			.select()
			.from(clubs)
			.where(and(eq(clubs.organizerId, organizer.id), eq(clubs.isActive, true)))
			.execute();
		// Remove id fields from all clubs
		const cleanClubs = clubsList.map(omitClubIds);
		return c.json({ clubs: cleanClubs }, 200);
	} catch (error) {
		console.error('Error fetching clubs:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// GET /clubs/:slug - detailed view of a single club
app.get('/clubs/:slug', async (c) => {
	try {
		const organizer = c.get('organizer');
		if (!organizer) {
			return c.json({ error: 'No organizer found for this domain' }, 404);
		}
		const clubSlug = c.req.param('slug');
		if (!clubSlug) return c.json({ error: 'Invalid club slug' }, 400);
		const clubQuery = await db
			.select()
			.from(clubs)
			.where(and(eq(clubs.slug, clubSlug), eq(clubs.organizerId, organizer.id), eq(clubs.isActive, true)))
			.limit(1)
			.execute();
		const club = clubQuery[0];
		if (!club) return c.json({ error: 'Club not found' }, 404);
		return c.json({ club: omitClubIds(club) }, 200);
	} catch (error) {
		console.error('Error fetching club:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// POST /clubs - create a new club
app.post('/clubs', async (c) => {
	try {
		const organizer = c.get('organizer');
		if (!organizer) {
			return c.json({ error: 'No organizer found for this domain' }, 404);
		}
		const body = await c.req.json();
		const { name, slug, description, imageUrls, videoUrls } = body;
		if (!name || !slug) {
			return c.json({ error: 'Missing required field: name or slug' }, 400);
		}
		const clubId = generateSecureRandomId();
		const [newClub] = await db
			.insert(clubs)
			.values({
				id: clubId,
				organizerId: organizer.id,
				name,
				slug,
				description: description || null,
				imageUrls: imageUrls || [],
				videoUrls: videoUrls || [],
				isActive: true,
			})
			.returning()
			.execute();
		return c.json({ club: omitClubIds(newClub), message: 'Club created successfully' }, 201);
	} catch (error) {
		console.error('Error creating club:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// PUT /clubs/:slug - update an existing club
app.put('/clubs/:slug', async (c) => {
	try {
		const organizer = c.get('organizer');
		if (!organizer) {
			return c.json({ error: 'No organizer found for this domain' }, 404);
		}
		const clubSlug = c.req.param('slug');
		if (!clubSlug) return c.json({ error: 'Invalid club slug' }, 400);
		const body = await c.req.json();
		// Verify club belongs to organizer
		const clubQuery = await db
			.select()
			.from(clubs)
			.where(and(eq(clubs.slug, clubSlug), eq(clubs.organizerId, organizer.id)))
			.limit(1)
			.execute();
		if (!clubQuery[0]) return c.json({ error: 'Club not found' }, 404);
		// Build update object
		const updateData: any = {
			updatedAt: new Date(),
		};
		if (body.name !== undefined) updateData.name = body.name;
		if (body.slug !== undefined) updateData.slug = body.slug;
		if (body.description !== undefined) updateData.description = body.description;
		if (body.imageUrls !== undefined) updateData.imageUrls = body.imageUrls;
		if (body.videoUrls !== undefined) updateData.videoUrls = body.videoUrls;
		if (body.isActive !== undefined) updateData.isActive = body.isActive;
		const [updatedClub] = await db.update(clubs).set(updateData).where(and(eq(clubs.slug, clubSlug), eq(clubs.organizerId, organizer.id))).returning().execute();
		return c.json({ club: omitClubIds(updatedClub), message: 'Club updated successfully' }, 200);
	} catch (error) {
		console.error('Error updating club:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// DELETE /clubs/:slug - soft delete a club
app.delete('/clubs/:slug', async (c) => {
	try {
		const organizer = c.get('organizer');
		if (!organizer) {
			return c.json({ error: 'No organizer found for this domain' }, 404);
		}
		const clubSlug = c.req.param('slug');
		if (!clubSlug) return c.json({ error: 'Invalid club slug' }, 400);
		// Verify club belongs to organizer
		const clubQuery = await db
			.select()
			.from(clubs)
			.where(and(eq(clubs.slug, clubSlug), eq(clubs.organizerId, organizer.id)))
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
			.where(eq(clubs.slug, clubSlug))
			.execute();
		return c.json({ message: 'Club deleted successfully' }, 200);
	} catch (error) {
		console.error('Error deleting club:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

export default app;
