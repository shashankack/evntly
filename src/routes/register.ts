// src/routes/register.ts
import { Hono } from 'hono';
import { db } from '../db/client';
import { activities, activityRegistrations, activitySchedules, payments, users, organizers } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { generateSecureRandomId } from '../utils/idGenerator';
import { sendRegistrationEmail } from '../utils/email';
import Razorpay from 'razorpay';

const app = new Hono();



app.post('/activities/:slug/register', async (c) => {
	try {
		const activitySlug = c.req.param('slug');
		if (!activitySlug || typeof activitySlug !== 'string') return c.json({ error: 'Invalid activity slug' }, 400);

		const body = await c.req.json<{
			firstName: string;
			lastName: string;
			email?: string;
			phone?: string;
			ticketCount?: number;
		}>();

		const { firstName, lastName, email, phone, ticketCount = 1 } = body;
		if (!firstName || !lastName || (!email && !phone)) return c.json({ error: 'Missing required user details' }, 400);

		// Validate ticketCount (max 4 tickets per registration)
		if (ticketCount < 1 || ticketCount > 4) {
			return c.json({ error: 'Ticket count must be between 1 and 4' }, 400);
		}

		// Get activity by slug
		const [activity] = await db.select().from(activities).where(eq(activities.slug, activitySlug)).limit(1).execute();
		if (!activity) return c.json({ error: 'Activity not found' }, 404);

		// Security check: Only allow registration for active and open activities
		if (!activity.isActive || !activity.isRegistrationOpen) {
			return c.json({ error: 'Registration is not open for this activity' }, 403);
		}

		// Optionally: Add more security checks here (e.g., rate limiting, domain checks, etc.)

		// Get organizer info for email and payment configuration
		let organizer = null;
		if (activity.organizerId) {
			console.log('🔍 Fetching organizer with ID:', activity.organizerId);
			[organizer] = await db.select().from(organizers).where(eq(organizers.id, activity.organizerId)).limit(1).execute();

			if (organizer) {
				console.log('✅ Organizer found:', {
					id: organizer.id,
					organizationName: organizer.organizationName,
					organizerEmail: organizer.organizerEmail,
					systemEmail: organizer.systemEmail,
					hasResendApiKey: !!organizer.resendApiKey,
					resendApiKeyPreview: organizer.resendApiKey ? `${organizer.resendApiKey.substring(0, 10)}...` : null,
				});
			} else {
				console.log('⚠️ Organizer not found for activity.organizerId:', activity.organizerId);
			}
		} else {
			console.log('⚠️ Activity has no organizerId');
		}

		// Determine payment method based on organizer's Razorpay credentials
		// If both razorpayKeyId and razorpayKeySecret exist, use 'razorpay', otherwise 'manual'
		const razorpayKeyId = organizer?.razorpayKeyId?.trim();
		const razorpayKeySecret = organizer?.razorpayKeySecret?.trim();
		const paymentMethod = razorpayKeyId && razorpayKeySecret ? 'razorpay' : 'manual';

		// For recurring activities, check if registration is open
		// For one-time activities, check status as well
		if (!activity.isRegistrationOpen) {
			return c.json({ error: 'Registration closed for this activity' }, 400);
		}

		if (activity.type === 'one-time') {
			// For one-time activities, check status
			if (!['upcoming', 'live'].includes(activity.status)) {
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

		console.log('💰 Activity pricing details:', {
			activityName: activity.name,
			registrationFee,
			isFree: registrationFee === 0,
			paymentMethod: razorpayKeyId && razorpayKeySecret ? 'razorpay' : 'manual',
		});

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
			const userValues: any = {
				id: userId,
				firstName,
				lastName,
				phone: phone || null,
				email: email || null,
				isActive: true,
			};
			// Don't include passwordHash at all - let the database handle it
			[user] = await db
				.insert(users)
				.values(userValues)
				.returning();
		}

		// Find existing registration
			const existing = await db
				.select()
				.from(activityRegistrations)
				.where(and(eq(activityRegistrations.activityId, activity.id), eq(activityRegistrations.userId, user.id)))
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
					  activityId: activity.id,
					userId: user.id,
					status: 'registered',
					ticketCount,
				})
				.returning();
		}

		console.log('📝 Registration completed. Now checking payment requirements...');
		console.log('Registration fee:', registrationFee, '| Is free?', registrationFee === 0);
		console.log('User email:', email, '| Has organizer?', !!organizer);

		// ------------------------
		// Send confirmation email for ALL registrations
		// ------------------------
		if (email && organizer) {
			console.log('\n========== EMAIL SENDING ATTEMPT ==========');
			console.log('📧 Attempting to send confirmation email to:', email);
			console.log('📋 Full Organizer details:', {
				id: organizer.id,
				organizationName: organizer.organizationName,
				organizerEmail: organizer.organizerEmail,
				systemEmail: organizer.systemEmail,
				hasResendApiKey: !!organizer.resendApiKey,
				resendApiKeyLength: organizer.resendApiKey?.length,
				resendApiKeyPrefix: organizer.resendApiKey?.substring(0, 7),
			});
			console.log('🎫 Email parameters:', {
				userEmail: email,
				userName: `${firstName} ${lastName}`,
				activityName: activity.name,
				ticketCount,
				venueName: activity.venueName,
			});

			try {
				console.log('🚀 Calling sendRegistrationEmail function...');
				const emailResult = await sendRegistrationEmail(
					email,
					`${firstName} ${lastName}`,
					activity.name,
					organizer.organizationName,
					organizer.organizerEmail,
					ticketCount,
					activity.venueName || undefined,
					typeof activity.additionalInfo === 'string' ? activity.additionalInfo : undefined,
					organizer.resendApiKey, // Pass organizer's Resend API key
					organizer.systemEmail // Pass organizer's system email
				);

				console.log('📬 Email send result:', JSON.stringify(emailResult, null, 2));

				if (emailResult.success) {
					console.log('✅✅✅ Registration confirmation email sent successfully!');
					console.log('   → To:', email);
					console.log('   → Message ID:', emailResult.messageId);
				} else {
					console.error('❌❌❌ Failed to send registration email!');
					console.error('   → Error:', emailResult.error);
				}
				console.log('========== EMAIL SENDING COMPLETE ==========\n');
			} catch (emailError) {
				console.error('❌❌❌ EXCEPTION while sending registration email!');
				console.error('Exception details:', emailError);
				console.error('Exception stack:', (emailError as Error).stack);
				console.log('========== EMAIL SENDING FAILED ==========\n');
				// Don't fail the registration if email fails
			}
		} else {
			if (!email) {
				console.log('⚠️ No email provided by user, skipping confirmation email');
			}
			if (!organizer) {
				console.log('⚠️ No organizer found, skipping confirmation email');
			}
		}

		// ------------------------
		// Free activity registration (no payment needed)
		// ------------------------
		if (registrationFee === 0) {
			console.log('🎉 Processing FREE activity registration - completing immediately');

			// Update booked slots immediately for free events
			await db
				.update(activities)
				.set({
					bookedSlots: sql`${activities.bookedSlots} + ${additionalTickets}`,
				})
				.where(eq(activities.id, activity.id))
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
		// Paid activity registration (razorpay or manual)
		// ------------------------
		console.log('💳 Processing PAID activity registration - payment information will be provided');
		console.log('Payment method:', paymentMethod);

		const paymentId = generateSecureRandomId();
		
		let paymentInfo: Record<string, any> = {};
		let razorpayOrderId: string | undefined = undefined;

		// Create payment record first (before Razorpay order creation)
		const [payment] = await db
			.insert(payments)
			.values({
				id: paymentId,
				registrationId: registration.id,
				amount: String((registrationFee / 100) * additionalTickets),
				status: 'pending',
				paymentMethod: paymentMethod,
				providerPaymentId: null, // Will update after Razorpay order creation
			})
			.returning();

		// Create Razorpay order asynchronously if using Razorpay
		if (paymentMethod === 'razorpay' && organizer) {
			try {
				console.log('🔑 Creating Razorpay order...');
				console.log('Using Razorpay Key ID:', razorpayKeyId ? `${razorpayKeyId.substring(0, 10)}...` : 'MISSING');

				const razorpayInstance = new Razorpay({
					key_id: razorpayKeyId!,
					key_secret: razorpayKeySecret!,
				});

				const razorpayOrder = await razorpayInstance.orders.create({
					amount: registrationFee * additionalTickets, // amount in paise
					currency: 'INR',
					receipt: paymentId,
					notes: {
						activityId: activity.id,
						activityName: activity.name,
						registrationId: registration.id,
						userId: user.id,
						ticketCount: String(additionalTickets),
					},
				});

				razorpayOrderId = razorpayOrder.id;
				console.log('✅ Razorpay order created:', razorpayOrderId);

				// Update payment record with Razorpay order ID
				await db
					.update(payments)
					.set({ providerPaymentId: razorpayOrderId })
					.where(eq(payments.id, payment.id))
					.execute();

				paymentInfo = {
					type: 'razorpay',
					razorpayKeyId: razorpayKeyId, // Pass Razorpay Key ID to frontend
					orderId: razorpayOrderId, // Use actual Razorpay order ID
					amount: registrationFee * additionalTickets,
					currency: 'INR',
				};
			} catch (razorpayError) {
				console.error('❌ Failed to create Razorpay order:', razorpayError);
				return c.json({ error: 'Failed to initialize payment gateway' }, 500);
			}
		} else if (paymentMethod === 'manual') {
			// Use organizer.domain if available, fallback to env or default
			const frontendDomain = organizer?.websiteDomain;
			paymentInfo = {
				type: 'manual',
				paymentPage: `${frontendDomain}/pay/${paymentId}`,
				qrCodeUrl: `${frontendDomain}/qr/${paymentId}`,
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
