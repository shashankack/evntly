// src/routes/organizerRegistrations.ts
import { Hono } from 'hono';
import { db } from '../db/client';
import { activities, activityRegistrations, users, organizers } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';

const app = new Hono();


// GET /organizer/registrations - List all registrations for events under this domain
app.get('/organizer/registrations', async (c) => {
  // Accept organizerEmail and password as query params
  const email = c.req.query('email');
  const password = c.req.query('password');
  if (!email || !password) {
    return c.json({ error: 'Missing email or password in URL query.' }, 400);
  }
  // Find organizer by email
  const [organizer] = await db.select().from(organizers).where(eq(organizers.organizerEmail, email)).limit(1).execute();
  if (!organizer) {
    return c.json({ error: 'Organizer not found.' }, 404);
  }
  // Find user for salt check
  if (!organizer.userId) {
    return c.json({ error: 'Organizer user not found.' }, 404);
  }
  const [user] = await db.select().from(users).where(eq(users.id, organizer.userId as string)).limit(1).execute();
  if (!user || !user.passwordHash) {
    return c.json({ error: 'Organizer user not found or no password set.' }, 404);
  }
  // Check if the password matches the stored hash
  const bcrypt = await import('bcryptjs');
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: 'Invalid password.' }, 401);
  }
  // Get all activities for this organizer
  const orgActivities = await db.select().from(activities).where(eq(activities.organizerId, organizer.id)).execute();
  if (orgActivities.length === 0) {
    return c.json({ error: 'No events found for this organizer.' }, 404);
  }
  const activityIds = orgActivities.map((a) => a.id).filter(Boolean);
  const regs = await db
    .select()
    .from(activityRegistrations)
    .where(inArray(activityRegistrations.activityId, activityIds))
    .execute();
  const userIds = regs.map((r) => r.userId).filter((id): id is string => typeof id === 'string');
  const usersList = userIds.length > 0
    ? await db.select().from(users).where(inArray(users.id, userIds as string[])).execute()
    : [];
  // Group registrations by activity
  const activityMap = Object.fromEntries(orgActivities.map((a) => [a.id, a]));
  const userMap = Object.fromEntries(usersList.map((u) => [u.id, u]));
  const grouped: Record<string, { activity: typeof orgActivities[0], users: typeof usersList }> = {};
  for (const a of orgActivities) {
    grouped[a.id] = { activity: a, users: [] };
  }
  for (const r of regs) {
    if (r.activityId && grouped[r.activityId] && r.userId && userMap[r.userId]) {
      grouped[r.activityId].users.push(userMap[r.userId]);
    }
  }
  // Return JSON output: Event name, then users (name, phone, email)
  const result = Object.values(grouped).map(group => ({
    activity: {
      ...group.activity
    },
    users: group.users.map(u => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
      email: u.email
    }))
  }));
  return c.json({
    organizer: {
      id: organizer.id,
      organizationName: organizer.organizationName,
      organizerEmail: organizer.organizerEmail
    },
    registrations: result
  });
});

export default app;
