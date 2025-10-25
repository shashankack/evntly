// src/routes/cron.ts
import { Hono } from 'hono';
import { db } from '../db/client';
import { activities } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';

const app = new Hono();

// GET /cron/update-activity-status
// Requires x-cron-secret header
app.get('/cron/update-activity-status', async (c) => {
    const secret = c.req.header('x-cron-secret');
    if (!secret || secret !== process.env.CRON_SECRET) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    const now = new Date();
    // Set to live if now >= start and now <= end
    await db.update(activities)
        .set({ status: 'live', updatedAt: now })
        .where(and(
            eq(activities.type, 'one-time'),
            sql`${activities.startDateTime} <= ${now}`,
            sql`${activities.endDateTime} >= ${now}`,
            eq(activities.status, 'upcoming')
        ))
        .execute();
    // Set to completed if now > end
    await db.update(activities)
        .set({ status: 'completed', updatedAt: now })
        .where(and(
            eq(activities.type, 'one-time'),
            sql`${activities.endDateTime} < ${now}`,
            eq(activities.status, 'upcoming')
        ))
        .execute();
    // Set to completed if now > end and status is live
    await db.update(activities)
        .set({ status: 'completed', updatedAt: now })
        .where(and(
            eq(activities.type, 'one-time'),
            sql`${activities.endDateTime} < ${now}`,
            eq(activities.status, 'live')
        ))
        .execute();
    return c.json({ message: 'Activity statuses updated' });
});

export default app;
