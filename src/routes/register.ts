// src/routes/register.ts
import { Hono } from 'hono';
import { db } from '../db/client';
import { activities, activityRegistrations, activitySchedules, payments, users } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { organizerAuth } from '../middleware/organizerAuth';
import { generateSecureRandomId } from '../utils/idGenerator';

const PAYMENT_METHOD = process.env.PAYMENT_METHOD || 'manual';
const app = new Hono();

app.use('*', organizerAuth);

app.post('/activities/:id/register', async (c) => {
	try {
		const activityId = Number(c.req.param('id'));
		if (isNaN(activityId)) return c.json({ error: 'Invalid activity ID' }, 400);

		const body = await c.req.json<{
			firstName: string;
			lastName: string;
			email?: string;
			phone?: string;
			ticketCount?: number;
		}>();

		const { firstName, lastName, email, phone, ticketCount = 1 } = body;
		if (!firstName || !lastName || (!email && !phone)) return c.json({ error: 'Missing required user details' }, 400);

		// Get activity
		const [activity] = await db.select().from(activities).where(eq(activities.id, activityId)).limit(1).execute();

		if (!activity) return c.json({ error: 'Activity not found' }, 404);
		
		// For recurring activities, check if registration is open
		// For one-time activities, check status as well
		if (!activity.isRegistrationOpen) {
			return c.json({ error: 'Registration closed for this activity' }, 400);
		}

		if (activity.type === 'one-time') {
			// For one-time activities, check status
			if (!['active', 'upcoming'].includes(activity.status)) {
				return c.json({ error: 'Registration closed for this activity' }, 400);
			}
		} else if (activity.type === 'recurring') {
			// For recurring activities, registration is always open as long as isRegistrationOpen is true
			// Status is calculated dynamically, so we don't check it here
		}

		// Defensive defaults for nullable fields
		const bookedSlots = activity.bookedSlots ?? 0;
		const availableSlots = activity.availableSlots ?? 0;
		const registrationFee = activity.registrationFee ?? 0;

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

		// Find existing registration
		const existing = await db
			.select()
			.from(activityRegistrations)
			.where(and(eq(activityRegistrations.activityId, activityId), eq(activityRegistrations.userId, user.id)))
			.limit(1)
			.execute();

		let registration;
		let additionalTickets = ticketCount;

		if (existing.length > 0) {
			const current = existing[0];

			// Prevent overbooking
			if (bookedSlots + ticketCount > availableSlots) return c.json({ error: 'Not enough slots available' }, 400);

			// Update existing registration ticket count
			[registration] = await db
				.update(activityRegistrations)
				.set({
					ticketCount: sql`${activityRegistrations.ticketCount} + ${ticketCount}`,
					updatedAt: new Date(),
				})
				.where(eq(activityRegistrations.id, current.id))
				.returning();
		} else {
			// Prevent overbooking
			if (bookedSlots + ticketCount > availableSlots) return c.json({ error: 'Not enough slots available' }, 400);

			// Create new registration
			const registrationId = generateSecureRandomId();
			[registration] = await db
				.insert(activityRegistrations)
				.values({
					id: registrationId,
					activityId,
					userId: user.id,
					status: 'registered',
					ticketCount,
				})
				.returning();
		}

		// ------------------------
		// Free OR manual payment registration
		// ------------------------
		if (registrationFee === 0 || PAYMENT_METHOD === 'manual') {
			await db
				.update(activities)
				.set({
					bookedSlots: sql`${activities.bookedSlots} + ${additionalTickets}`,
				})
				.where(eq(activities.id, activityId))
				.execute();

			return c.json(
				{
					message: 'Registration successful',
					user,
					registration,
					activity,
				},
				200
			);
		}

		// ------------------------
		// Paid gateway registration
		// ------------------------
		const paymentId = generateSecureRandomId();
		const [payment] = await db
			.insert(payments)
			.values({
				id: paymentId,
				registrationId: registration.id,
				amount: String((registrationFee / 100) * additionalTickets),
				status: 'pending',
				paymentMethod: PAYMENT_METHOD,
			})
			.returning();

		let paymentInfo: Record<string, any> = {};
		if (PAYMENT_METHOD === 'razorpay') {
			paymentInfo = {
				type: 'razorpay',
				orderId: `order_${payment.id}`,
				amount: registrationFee * additionalTickets,
				currency: 'INR',
			};
		} else {
			paymentInfo = {
				type: 'manual',
				paymentPage: `${process.env.FRONTEND_URL || 'https://evntly.app'}/pay/${payment.id}`,
				qrCodeUrl: `${process.env.FRONTEND_URL || 'https://evntly.app'}/qr/${payment.id}`,
			};
		}

		return c.json(
			{
				message: 'Payment initiated. Confirm to finalize registration.',
				user,
				registration,
				payment,
				paymentInfo,
			},
			200
		);
	} catch (error) {
		console.error('Error during registration:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

export default app;
