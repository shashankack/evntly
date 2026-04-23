// src/routes/register.ts
import { Hono } from 'hono';
import { db } from '../db/client';
import { activities, activityRegistrations, activitySchedules, payments, users, organizers } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { generateSecureRandomId } from '../utils/idGenerator';
import { sendRegistrationEmail } from '../utils/email';
import { incrementBookedSlotsAndCloseIfFull } from '../utils/booking';
import { computeRegistrationPricing, parsePricingConfig, SelectedAddOn } from '../utils/pricing';
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
			addOns?: SelectedAddOn[];
		}>();

		const { firstName, lastName, email, phone, ticketCount = 1, addOns = [] } = body;
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
		// For one-time activities, use the event window instead of the stored status.
		if (!activity.isRegistrationOpen) {
			return c.json({ error: 'Registration closed for this activity' }, 400);
		}

		if (activity.type === 'one-time') {
			const now = new Date();
			const end = activity.endDateTime ? new Date(activity.endDateTime) : null;

			if (end && now > end) {
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
		const pricingConfig = parsePricingConfig(activity.pricingConfig);
		const feeDetails = computeRegistrationPricing({
			registrationFeePaise: registrationFee,
			pricingConfig,
			baseCount: ticketCount,
			selectedAddOns: addOns,
		});

		console.log('💰 Activity pricing details:', {
			activityName: activity.name,
			registrationFee,
			totalAmountPaise: feeDetails.totalAmountPaise,
			isFree: feeDetails.totalAmountPaise === 0,
			paymentMethod: razorpayKeyId && razorpayKeySecret ? 'razorpay' : 'manual',
		});

		// Find or create user - check by email OR phone
		let user;
		
		if (email && phone) {
			// If both are provided, check for either match
			[user] = await db
				.select()
				.from(users)
				.where(
					sql`${users.email} = ${email} OR ${users.phone} = ${phone}`
				)
				.limit(1)
				.execute();
		} else if (email) {
			// Only email provided
			[user] = await db
				.select()
				.from(users)
				.where(eq(users.email, email))
				.limit(1)
				.execute();
		} else if (phone) {
			// Only phone provided
			[user] = await db
				.select()
				.from(users)
				.where(eq(users.phone, phone))
				.limit(1)
				.execute();
		}

		if (!user) {
			const userId = generateSecureRandomId();
			const userValues: any = {
				id: userId,
				firstName,
				lastName,
				phone: phone || null,
				email: email || null,
				passwordHash: null,
				isActive: true,
			};
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
		const seatCount = feeDetails.seatCount;

		if (existing.length > 0) {
			const current = existing[0];

			// Prevent overbooking
			if (bookedSlots + seatCount > availableSlots) return c.json({ error: 'Not enough slots available' }, 400);

			// Update existing registration ticket count
			[registration] = await db
				.update(activityRegistrations)
				.set({
					ticketCount: sql`${activityRegistrations.ticketCount} + ${ticketCount}`,
					seatCount: sql`${activityRegistrations.seatCount} + ${seatCount}`,
					totalAmountPaise: sql`${activityRegistrations.totalAmountPaise} + ${feeDetails.totalAmountPaise}`,
					selectedAddOns: addOns.length ? addOns : current.selectedAddOns,
					feeBreakdown: feeDetails,
					updatedAt: new Date(),
				})
				.where(eq(activityRegistrations.id, current.id))
				.returning();
		} else {
			// Prevent overbooking
			if (bookedSlots + seatCount > availableSlots) return c.json({ error: 'Not enough slots available' }, 400);

			// Create new registration
			const registrationId = generateSecureRandomId();
			[registration] = await db
				.insert(activityRegistrations)
				.values({
					id: registrationId,
					  activityId: activity.id,
					userId: user.id,
					status: 'canceled',
					ticketCount,
					seatCount,
					totalAmountPaise: feeDetails.totalAmountPaise,
					selectedAddOns: addOns,
					feeBreakdown: feeDetails,
				})
				.returning();
		}

		console.log('📝 Registration record created. Now checking payment requirements...');
		console.log('Registration fee:', registrationFee, '| Total amount paise:', feeDetails.totalAmountPaise, '| Is free?', feeDetails.totalAmountPaise === 0);
		console.log('User email:', email, '| Has organizer?', !!organizer);

		// ------------------------
		// Free activity registration (no payment needed)
		// ------------------------
		if (feeDetails.totalAmountPaise === 0) {
			console.log('🎉 Processing FREE activity registration - completing immediately');

			await incrementBookedSlotsAndCloseIfFull(activity.id, seatCount);

			if (email && organizer) {
				try {
					await sendRegistrationEmail(
						email,
						`${firstName} ${lastName}`,
						activity.name,
						organizer.organizationName,
						organizer.organizerEmail,
						ticketCount,
						feeDetails,
						activity.venueName || undefined,
						typeof activity.additionalInfo === 'string' ? activity.additionalInfo : undefined,
						organizer.resendApiKey,
						organizer.systemEmail
					);
					console.log('✅ Free registration confirmation email sent');
				} catch (emailError) {
					console.error('❌ Failed to send free registration email:', emailError);
				}
			}

			return c.json(
				{
					message: 'Registration successful',
					user,
					registration,
					activity,
					feeDetails,
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
				amount: String(feeDetails.totalAmountPaise / 100),
				amountPaise: feeDetails.totalAmountPaise,
				status: 'pending',
				paymentMethod: paymentMethod,
				providerPaymentId: null, // Will update after Razorpay order creation
				feeBreakdown: feeDetails,
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
					amount: feeDetails.totalAmountPaise, // amount in paise
					currency: 'INR',
					receipt: paymentId,
					notes: {
						activityId: activity.id,
						activityName: activity.name,
						registrationId: registration.id,
						userId: user.id,
						ticketCount: String(ticketCount),
						seatCount: String(seatCount),
						selectedAddOns: JSON.stringify(addOns),
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
					amount: feeDetails.totalAmountPaise,
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
				feeDetails,
			},
			200
		);
	} catch (error) {
		console.error('Error during registration:', error);
		
		// Handle specific database errors
		if (error instanceof Error) {
			const errorMessage = error.message.toLowerCase();

			if (errorMessage.includes('unknown add-on') || errorMessage.includes('add-on quantity exceeds allowed maximum')) {
				return c.json({ error: error.message }, 400);
			}
			
			// Check for duplicate key violations
			if (errorMessage.includes('duplicate key') || errorMessage.includes('unique constraint')) {
				if (errorMessage.includes('phone')) {
					return c.json({ error: 'This phone number is already registered. Please use a different number.' }, 400);
				}
				if (errorMessage.includes('email')) {
					return c.json({ error: 'This email is already registered. Please use a different email.' }, 400);
				}
				return c.json({ error: 'An account with these details already exists.' }, 400);
			}
		}
		
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

export default app;
