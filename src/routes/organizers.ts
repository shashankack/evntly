// src/routes/organizers.ts
import { Hono } from 'hono';
import { db } from '../db/client';
import { organizers, users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateSecureRandomId } from '../utils/idGenerator';

interface Env {
	Variables: {
		organizer: any;
	};
}

const app = new Hono<Env>();

// -----------------------------
// POST /organizers/register
// Register a new organizer and send secret key via email
// Public endpoint (no auth required)
// -----------------------------
app.post('/organizers/register', async (c) => {
	try {
		const body = await c.req.json<{
			organizationName: string;
			organizerEmail: string;
			firstName: string;
			lastName: string;
			phone?: string;
			websiteDomain: string;
		}>();

		const { organizationName, organizerEmail, firstName, lastName, phone, websiteDomain } = body;

		if (!organizationName || !organizerEmail || !firstName || !lastName || !websiteDomain) {
			return c.json({ error: 'Missing required fields: organizationName, organizerEmail, firstName, lastName, websiteDomain' }, 400);
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(organizerEmail)) {
			return c.json({ error: 'Invalid email format' }, 400);
		}

		// Validate and normalize website domain
		const normalizedDomain = websiteDomain
			.trim()
			.toLowerCase()
			.replace(/^https?:\/\//, '')
			.replace(/^www\./, '')
			.replace(/\/$/, '');

		if (!normalizedDomain) {
			return c.json({ error: 'Invalid website domain' }, 400);
		}

		// Check if domain is already registered
		const existingDomain = await db.select().from(organizers).where(eq(organizers.websiteDomain, normalizedDomain)).limit(1).execute();

		if (existingDomain.length > 0) {
			return c.json({ error: 'This website domain is already registered to another organizer' }, 409);
		}

		// Check if organizer email already exists
		const existingOrganizer = await db.select().from(organizers).where(eq(organizers.organizerEmail, organizerEmail)).limit(1).execute();

		if (existingOrganizer.length > 0) {
			return c.json({ error: 'An organizer with this email already exists' }, 409);
		}

		// Create or find user
		let [user] = await db.select().from(users).where(eq(users.email, organizerEmail)).limit(1).execute();

		if (!user) {
			const userId = generateSecureRandomId();
			[user] = await db
				.insert(users)
				.values({
					id: userId,
					firstName,
					lastName,
					email: organizerEmail,
					phone: phone || null,
					isActive: true,
					passwordHash: null,
				})
				.returning();
		}

		// Create organizer with domain-based auth (no secret key needed)
		const organizerId = generateSecureRandomId();

		// Create organizer
		const [organizer] = await db
			.insert(organizers)
			.values({
				id: organizerId,
				userId: user.id,
				organizationName,
				organizerEmail,
				websiteDomain: normalizedDomain,
				isActive: true,
			})
			.returning();

		// Note: Welcome email functionality removed - organizers need to configure Resend API key first
		// to send emails. They can add their resendApiKey in the organizers table.

		return c.json(
			{
				message: 'Organizer registered successfully',
				organizer: {
					id: organizer.id,
					organizationName: organizer.organizationName,
					email: organizer.organizerEmail,
					websiteDomain: normalizedDomain,
				},
				note: 'Your website domain has been registered. Visitors from your domain will automatically see your content.',
			},
			201
		);
	} catch (error) {
		console.error('Error registering organizer:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

export default app;
