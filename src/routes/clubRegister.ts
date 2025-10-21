// src/routes/clubRegister.ts
import { Hono } from 'hono';
import { db } from '../db/client';
import { clubs, clubMembers, users } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { originResolver } from '../middleware/originResolver';
import { generateSecureRandomId } from '../utils/idGenerator';

const app = new Hono();

// Resolve organizer from Origin/Host header for domain-scoped requests
app.use('*', originResolver);

// POST /clubs/:id/register - Register a user as a club member
app.post('/clubs/:id/register', async (c) => {
	try {
		const clubId = c.req.param('id');
		if (!clubId || typeof clubId !== 'string') return c.json({ error: 'Invalid club ID' }, 400);

		const body = await c.req.json<{
			firstName: string;
			lastName: string;
			email?: string;
			phone?: string;
			role?: string;
		}>();

		const { firstName, lastName, email, phone, role = 'member' } = body;
		if (!firstName || !lastName || (!email && !phone)) return c.json({ error: 'Missing required user details' }, 400);

		// Get club
		const [club] = await db.select().from(clubs).where(eq(clubs.id, String(clubId))).limit(1).execute();
		if (!club || !club.isActive) return c.json({ error: 'Club not found or inactive' }, 404);

		// Find or create user
		let [user] =
			(await db
				.select()
				.from(users)
				.where(email ? eq(users.email, email) : eq(users.phone, phone!))
				.limit(1)
				.execute()) || [];

		if (!user) {
			const userId = generateSecureRandomId();
			[user] = await db
				.insert(users)
				.values({
					id: userId,
					firstName,
					lastName,
					email: email || null,
					phone: phone || null,
					isActive: true,
				})
				.returning();
		}

		// Check if already a member
		const existing = await db
			.select()
			.from(clubMembers)
			.where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, user.id)))
			.limit(1)
			.execute();

		if (existing.length > 0) {
			return c.json({ message: 'User is already a member of this club', user }, 200);
		}

		// Register as member
		const membershipId = generateSecureRandomId();
		const [membership] = await db
			.insert(clubMembers)
			.values({
				id: membershipId,
				clubId,
				userId: user.id,
				role,
				isActive: true,
			})
			.returning();

		return c.json({ message: 'Club registration successful', user, membership }, 200);
	} catch (error) {
		console.error('Error during club registration:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

export default app;
