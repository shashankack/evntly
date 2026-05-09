// src/routes/organizerRegistrations.ts
import { Hono } from 'hono';
import { db } from '../db/client';
import { activities, activityRegistrations, users, organizers, payments } from '../db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { generateSecureRandomId } from '../utils/idGenerator';
import { computeRegistrationPricing, parsePricingConfig } from '../utils/pricing';
import type { SelectedAddOn } from '../utils/pricing';
import { incrementBookedSlotsAndCloseIfFull } from '../utils/booking';

const app = new Hono();



import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'changeme-in-prod';

// POST /organizer/login - returns JWT if credentials are valid
app.post('/organizer/login', async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) {
    return c.json({ error: 'Missing email or password.' }, 400);
  }
  const [organizer] = await db.select().from(organizers).where(eq(organizers.organizerEmail, email)).limit(1).execute();
  if (!organizer || !organizer.userId) {
    return c.json({ error: 'Organizer not found.' }, 404);
  }
  const [user] = await db.select().from(users).where(eq(users.id, organizer.userId as string)).limit(1).execute();
  if (!user || !user.passwordHash) {
    return c.json({ error: 'Organizer user not found or no password set.' }, 404);
  }
  const bcrypt = await import('bcryptjs');
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: 'Invalid password.' }, 401);
  }
  // Issue JWT
  const token = jwt.sign({ organizerId: organizer.id, email: organizer.organizerEmail }, JWT_SECRET, { expiresIn: '2h' });
  return c.json({ token });
});

// GET /organizer/registrations - now requires Bearer token
app.get('/organizer/registrations', async (c) => {
  const auth = c.req.header('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header.' }, 401);
  }
  let organizerId;
  try {
    const payload = jwt.verify(auth.replace('Bearer ', ''), JWT_SECRET) as { organizerId: string };
    organizerId = payload.organizerId;
  } catch (e) {
    return c.json({ error: 'Invalid or expired token.' }, 401);
  }
  // Get all activities for this organizer
  const orgActivities = await db.select().from(activities).where(eq(activities.organizerId, organizerId)).execute();
  if (orgActivities.length === 0) {
    return c.json({ error: 'No events found for this organizer.' }, 404);
  }
  const activityIds = orgActivities.map((a) => a.id).filter(Boolean);
  const regs = await db
    .select()
    .from(activityRegistrations)
    .where(inArray(activityRegistrations.activityId, activityIds))
    .execute();
  
  // Get only registrations with completed payments
  const registrationIds = regs.map((r) => r.id).filter(Boolean);
  const completedPayments = registrationIds.length > 0
    ? await db.select().from(payments)
        .where(and(
          inArray(payments.registrationId, registrationIds),
          eq(payments.status, 'completed')
        ))
        .execute()
    : [];
  
  // Create a map of registration IDs to payment metadata
  const paymentMap = Object.fromEntries(completedPayments.map(p => [p.registrationId, p.id]));
  const paymentMethodMap = Object.fromEntries(completedPayments.map(p => [p.registrationId, p.paymentMethod]));
  const completedRegIds = new Set(completedPayments.map(p => p.registrationId));
  
  // Filter registrations to only those with completed payments
  const regsWithCompletedPayments = regs.filter(r => completedRegIds.has(r.id));
  
  const userIds = regsWithCompletedPayments.map((r) => r.userId).filter((id): id is string => typeof id === 'string');
  const usersList = userIds.length > 0
    ? await db.select().from(users).where(inArray(users.id, userIds as string[])).execute()
    : [];
  // Group registrations by activity
  const activityMap = Object.fromEntries(orgActivities.map((a) => [a.id, a]));
  const userMap = Object.fromEntries(usersList.map((u) => [u.id, u]));
  const grouped: Record<string, { activity: typeof orgActivities[0], users: Array<any> }> = {};
  for (const a of orgActivities) {
    grouped[a.id] = { activity: a, users: [] };
  }
  for (const r of regsWithCompletedPayments) {
    if (r.activityId && grouped[r.activityId] && r.userId && userMap[r.userId]) {
      grouped[r.activityId].users.push({
        registrationId: r.id,
        ...userMap[r.userId],
        paymentId: paymentMap[r.id] || null,
        paymentMethod: paymentMethodMap[r.id] || null,
        registrationStatus: r.status,
      });
    }
  }
  // Return JSON output: Event name, then users (name, phone, email, paymentId)
  const result = Object.values(grouped).map(group => ({
    activity: {
      ...group.activity
    },
    users: group.users.map(u => ({
      registrationId: u.registrationId,
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
      email: u.email,
      paymentId: u.paymentId,
      paymentMethod: u.paymentMethod || null,
      registrationStatus: u.registrationStatus || null
    }))
  }));

  // (attendance route moved out of this handler)
  // Get organizer info
  const [organizer] = await db.select().from(organizers).where(eq(organizers.id, organizerId)).limit(1).execute();
  return c.json({
    organizer: {
      id: organizer.id,
      organizationName: organizer.organizationName,
      organizerEmail: organizer.organizerEmail
    },
    activities: orgActivities,
    registrations: result
  });
});

// PATCH /organizer/registrations/:registrationId/attendance - mark a registration as attended
app.patch('/organizer/registrations/:registrationId/attendance', async (c) => {
  const auth = c.req.header('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header.' }, 401);
  }

  let organizerId;
  try {
    const payload = jwt.verify(auth.replace('Bearer ', ''), JWT_SECRET) as { organizerId: string };
    organizerId = payload.organizerId;
  } catch (e) {
    return c.json({ error: 'Invalid or expired token.' }, 401);
  }

  try {
    const registrationId = c.req.param('registrationId');
    if (!registrationId) {
      return c.json({ error: 'Missing registrationId' }, 400);
    }

    const [registrationRow] = await db
      .select({
        registration: activityRegistrations,
        activity: activities,
      })
      .from(activityRegistrations)
      .innerJoin(activities, eq(activityRegistrations.activityId, activities.id))
      .where(and(eq(activityRegistrations.id, registrationId), eq(activities.organizerId, organizerId)))
      .limit(1)
      .execute();

    if (!registrationRow) {
      return c.json({ error: 'Registration not found for this organizer' }, 404);
    }

    if (registrationRow.registration.status === 'attended') {
      return c.json({
        message: 'Registration already marked as attended',
        registration: registrationRow.registration,
      }, 200);
    }

    const [updatedRegistration] = await db
      .update(activityRegistrations)
      .set({
        status: 'attended',
        updatedAt: new Date(),
      })
      .where(eq(activityRegistrations.id, registrationId))
      .returning();

    return c.json({
      message: 'Attendance marked successfully',
      registration: updatedRegistration,
    }, 200);
  } catch (error) {
    console.error('Error marking attendance:', error);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// POST /organizer/registrations - manually add an offline registration
app.post('/organizer/registrations', async (c) => {
  const auth = c.req.header('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header.' }, 401);
  }

  let organizerId;
  try {
    const payload = jwt.verify(auth.replace('Bearer ', ''), JWT_SECRET) as { organizerId: string };
    organizerId = payload.organizerId;
  } catch (e) {
    return c.json({ error: 'Invalid or expired token.' }, 401);
  }

  try {
    const body = await c.req.json<{
      activityId: string;
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      ticketCount?: number;
      addOns?: SelectedAddOn[];
    }>();

    const { activityId, firstName, lastName, email, phone, ticketCount = 1, addOns = [] } = body;

    if (!activityId || !firstName || !lastName || (!email && !phone)) {
      return c.json({ error: 'Missing required fields: activityId, firstName, lastName, and at least one contact method' }, 400);
    }

    if (ticketCount < 1 || ticketCount > 4) {
      return c.json({ error: 'Ticket count must be between 1 and 4' }, 400);
    }

    const [activity] = await db
      .select()
      .from(activities)
      .where(and(eq(activities.id, activityId), eq(activities.organizerId, organizerId)))
      .limit(1)
      .execute();

    if (!activity) {
      return c.json({ error: 'Activity not found for this organizer' }, 404);
    }

    const pricingConfig = parsePricingConfig(activity.pricingConfig);
    const feeDetails = computeRegistrationPricing({
      registrationFeePaise: activity.registrationFee ?? 0,
      pricingConfig,
      baseCount: ticketCount,
      selectedAddOns: addOns,
    });

    let user;
    if (email && phone) {
      [user] = await db
        .select()
        .from(users)
        .where(sql`${users.email} = ${email} OR ${users.phone} = ${phone}`)
        .limit(1)
        .execute();
    } else if (email) {
      [user] = await db.select().from(users).where(eq(users.email, email)).limit(1).execute();
    } else if (phone) {
      [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1).execute();
    }

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
          passwordHash: null,
          isActive: true,
        })
        .returning();
    }

    const existing = await db
      .select()
      .from(activityRegistrations)
      .where(and(eq(activityRegistrations.activityId, activity.id), eq(activityRegistrations.userId, user.id)))
      .limit(1)
      .execute();

    if (existing.length > 0) {
      return c.json({ error: 'This user is already registered for this activity' }, 409);
    }

    const registrationId = generateSecureRandomId();
    const [registration] = await db
      .insert(activityRegistrations)
      .values({
        id: registrationId,
        activityId: activity.id,
        userId: user.id,
        status: 'registered',
        ticketCount,
        seatCount: feeDetails.seatCount,
        totalAmountPaise: feeDetails.totalAmountPaise,
        selectedAddOns: addOns,
        feeBreakdown: feeDetails,
      })
      .returning();

    const paymentId = generateSecureRandomId();
    const [payment] = await db
      .insert(payments)
      .values({
        id: paymentId,
        registrationId: registration.id,
        amount: String(feeDetails.totalAmountPaise / 100),
        amountPaise: feeDetails.totalAmountPaise,
        status: 'completed',
        paymentMethod: 'manual',
        providerPaymentId: null,
        feeBreakdown: feeDetails,
      })
      .returning();

    await incrementBookedSlotsAndCloseIfFull(activity.id, feeDetails.seatCount);

    return c.json(
      {
        message: 'Manual registration added successfully',
        user,
        registration,
        payment,
        feeDetails,
      },
      201
    );
  } catch (error) {
    console.error('Error creating manual registration:', error);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
