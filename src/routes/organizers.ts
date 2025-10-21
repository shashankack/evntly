// src/routes/organizers.ts
import { Hono } from 'hono';
import { db } from '../db/client';
import { organizers, users } from '../db/schema';
import { eq, and, lt, sql } from 'drizzle-orm';
import { generateToken, getTokenExpiry } from '../utils/jwt';
import { sendSystemEmail } from '../utils/email';
import { getSecretKeyEmailHTML, getSecretKeyEmailSubject } from '../templates/secretKeyEmail';
import { organizerAuth } from '../middleware/organizerAuth';
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
		}>();

		const { organizationName, organizerEmail, firstName, lastName, phone } = body;

		if (!organizationName || !organizerEmail || !firstName || !lastName) {
			return c.json({ error: 'Missing required fields' }, 400);
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(organizerEmail)) {
			return c.json({ error: 'Invalid email format' }, 400);
		}

		// Check if organizer email already exists
		const existingOrganizer = await db
			.select()
			.from(organizers)
			.where(eq(organizers.organizerEmail, organizerEmail))
			.limit(1)
			.execute();

		if (existingOrganizer.length > 0) {
			return c.json({ error: 'An organizer with this email already exists' }, 409);
		}

		// Create or find user
		let [user] = await db
			.select()
			.from(users)
			.where(eq(users.email, organizerEmail))
			.limit(1)
			.execute();

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
				})
				.returning();
		}

		// Generate JWT token (temporary, will update after organizer creation)
		const organizerId = generateSecureRandomId();
		const secretKey = generateToken({
			organizerId,
			organizationName,
			email: organizerEmail,
		});

		// Create organizer
		const [organizer] = await db
			.insert(organizers)
			.values({
				id: organizerId,
				userId: user.id,
				organizationName,
				organizerEmail,
				secretKey,
				isActive: true,
				secretKeyLastRotated: new Date(),
			})
			.returning();

		// Send email with secret key
		const expiryDate = getTokenExpiry(secretKey);
		const emailHTML = getSecretKeyEmailHTML({
			organizationName,
			secretKey,
			expiryDate: expiryDate?.toLocaleDateString('en-US', {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			}) || 'Unknown',
			isRotation: false,
		});

		const emailResult = await sendSystemEmail(
			organizerEmail,
			getSecretKeyEmailSubject(false),
			emailHTML
		);

		if (!emailResult.success) {
			console.error('Failed to send email:', emailResult.error);
			// Don't fail the registration, but log it
		}

		return c.json(
			{
				message: 'Organizer registered successfully',
				organizer: {
					id: organizer.id,
					organizationName: organizer.organizationName,
					email: organizer.organizerEmail,
				},
				emailSent: emailResult.success,
				note: 'Secret key has been sent to your email. Please check your inbox.',
			},
			201
		);
	} catch (error) {
		console.error('Error registering organizer:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// -----------------------------
// POST /organizers/rotate-key
// Manually rotate secret key for authenticated organizer
// Requires authentication
// -----------------------------
app.post('/organizers/rotate-key', organizerAuth, async (c) => {
	try {
		const organizer = c.get('organizer');

		// Generate new JWT token
		const newSecretKey = generateToken({
			organizerId: organizer.id,
			organizationName: organizer.organizationName,
			email: organizer.organizerEmail,
		});

		// Update organizer with new secret key
		await db
			.update(organizers)
			.set({
				secretKey: newSecretKey,
				secretKeyLastRotated: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(organizers.id, organizer.id))
			.execute();

		// Send email with new secret key
		const expiryDate = getTokenExpiry(newSecretKey);
		const emailHTML = getSecretKeyEmailHTML({
			organizationName: organizer.organizationName,
			secretKey: newSecretKey,
			expiryDate: expiryDate?.toLocaleDateString('en-US', {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			}) || 'Unknown',
			isRotation: true,
		});

		const emailResult = await sendSystemEmail(
			organizer.organizerEmail,
			getSecretKeyEmailSubject(true),
			emailHTML
		);

		return c.json(
			{
				message: 'Secret key rotated successfully',
				emailSent: emailResult.success,
				note: 'New secret key has been sent to your email.',
			},
			200
		);
	} catch (error) {
		console.error('Error rotating key:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// -----------------------------
// GET /organizers/auto-rotate
// Automatically rotate keys that are older than 14 days
// This should be called by a cron job/scheduled worker
// No auth required (internal endpoint)
// -----------------------------
app.get('/organizers/auto-rotate', async (c) => {
	try {
		// Check for authorization header (simple protection for cron endpoints)
		const cronSecret = c.req.header('x-cron-secret');
		if (cronSecret !== process.env.CRON_SECRET) {
			return c.json({ error: 'Unauthorized' }, 401);
		}

		// Find organizers whose keys are older than 14 days
		const fourteenDaysAgo = new Date();
		fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

		const organizersToRotate = await db
			.select()
			.from(organizers)
			.where(
				and(
					eq(organizers.isActive, true),
					lt(organizers.secretKeyLastRotated, fourteenDaysAgo)
				)
			)
			.execute();

		const rotationResults = [];

		for (const org of organizersToRotate) {
			try {
				// Generate new JWT token
				const newSecretKey = generateToken({
					organizerId: org.id,
					organizationName: org.organizationName,
					email: org.organizerEmail,
				});

				// Update organizer with new secret key
				await db
					.update(organizers)
					.set({
						secretKey: newSecretKey,
						secretKeyLastRotated: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(organizers.id, org.id))
					.execute();

				// Send email with new secret key
				const expiryDate = getTokenExpiry(newSecretKey);
				const emailHTML = getSecretKeyEmailHTML({
					organizationName: org.organizationName,
					secretKey: newSecretKey,
					expiryDate: expiryDate?.toLocaleDateString('en-US', {
						weekday: 'long',
						year: 'numeric',
						month: 'long',
						day: 'numeric',
					}) || 'Unknown',
					isRotation: true,
				});

				const emailResult = await sendSystemEmail(
					org.organizerEmail,
					getSecretKeyEmailSubject(true),
					emailHTML
				);

				rotationResults.push({
					organizerId: org.id,
					organizationName: org.organizationName,
					success: true,
					emailSent: emailResult.success,
				});
			} catch (error) {
				console.error(`Failed to rotate key for organizer ${org.id}:`, error);
				rotationResults.push({
					organizerId: org.id,
					organizationName: org.organizationName,
					success: false,
					error: String(error),
				});
			}
		}

		return c.json(
			{
				message: 'Auto-rotation completed',
				totalProcessed: organizersToRotate.length,
				results: rotationResults,
			},
			200
		);
	} catch (error) {
		console.error('Error in auto-rotate:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// -----------------------------
// GET /organizers/me
// Get current organizer info
// Requires authentication
// -----------------------------
app.get('/organizers/me', organizerAuth, async (c) => {
	try {
		const organizer = c.get('organizer');

		return c.json(
			{
				organizer: {
					id: organizer.id,
					organizationName: organizer.organizationName,
					email: organizer.organizerEmail,
					isActive: organizer.isActive,
					secretKeyLastRotated: organizer.secretKeyLastRotated,
					createdAt: organizer.createdAt,
				},
			},
			200
		);
	} catch (error) {
		console.error('Error fetching organizer:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

export default app;
