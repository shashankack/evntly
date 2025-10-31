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
    return c.html('<h2>Missing email or password in URL query.</h2>');
  }
  // Find organizer by email
  const [organizer] = await db.select().from(organizers).where(eq(organizers.organizerEmail, email)).limit(1).execute();
  if (!organizer) {
    return c.html('<h2>Organizer not found.</h2>');
  }
  // Find user for salt check
  if (!organizer.userId) {
    return c.html('<h2>Organizer user not found.</h2>');
  }
  const [user] = await db.select().from(users).where(eq(users.id, organizer.userId as string)).limit(1).execute();
  if (!user || !user.passwordHash) {
    return c.html('<h2>Organizer user not found or no password set.</h2>');
  }
  // Check if the password matches the stored hash
  const bcrypt = await import('bcryptjs');
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return c.html('<h2>Invalid password.</h2>');
  }
  // Get all activities for this organizer
  const orgActivities = await db.select().from(activities).where(eq(activities.organizerId, organizer.id)).execute();
  if (orgActivities.length === 0) {
    return c.html('<h2>No events found for this organizer.</h2>');
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
  // Simple HTML output: Event name, then users (name, phone, email)
  let html = `<html><head><title>Event Registrations</title>
    <style>
      body { font-family: sans-serif; margin: 2rem; }
      h2 { margin-top: 2rem; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
      th, td { border: 1px solid #ccc; padding: 8px; }
      th { background: #f5f5f5; }
    </style>
    </head><body>
    <h1>Registrations for ${organizer.organizationName}</h1>`;
  for (const group of Object.values(grouped)) {
    html += `<h2>${group.activity.name}</h2>`;
    if (group.users.length === 0) {
      html += '<p>No registrations.</p>';
    } else {
      html += `<table><thead><tr><th>Name</th><th>Phone</th><th>Email</th></tr></thead><tbody>`;
      for (const u of group.users) {
        const phone = u.phone ? `<a href="tel:${u.phone}">${u.phone}</a>` : '';
        const email = u.email ? `<a href="mailto:${u.email}">${u.email}</a>` : '';
        html += `<tr><td>${u.firstName} ${u.lastName}</td><td>${phone}</td><td>${email}</td></tr>`;
      }
      html += `</tbody></table>`;
    }
  }
  html += '</body></html>';
  return c.html(html);
});

export default app;
