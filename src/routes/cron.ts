// src/routes/cron.ts
import { Hono } from 'hono';
import { db } from '../db/client';
import { activities, activityRegistrations, payments } from '../db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';

const app = new Hono();

const PAYMENT_CLEANUP_HOURS = 24;

async function cleanupAbandonedPayments(now: Date) {
    const cutoff = new Date(now.getTime() - PAYMENT_CLEANUP_HOURS * 60 * 60 * 1000);

    const stalePayments = await db
        .select({ id: payments.id, registrationId: payments.registrationId })
        .from(payments)
        .where(and(
            eq(payments.status, 'pending'),
            sql`${payments.createdAt} < ${cutoff}`
        ))
        .execute();

    if (!stalePayments.length) {
        return 0;
    }

    const paymentIds = stalePayments.map((payment) => payment.id);
    const registrationIds = stalePayments
        .map((payment) => payment.registrationId)
        .filter((registrationId): registrationId is string => typeof registrationId === 'string');

    await db
        .update(payments)
        .set({ status: 'failed', updatedAt: now })
        .where(inArray(payments.id, paymentIds))
        .execute();

    if (registrationIds.length > 0) {
        await db
            .update(activityRegistrations)
            .set({ status: 'canceled', updatedAt: now })
            .where(inArray(activityRegistrations.id, registrationIds))
            .execute();
    }

    return stalePayments.length;
}

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
    // Set to completed if now > end and status is live
    await db.update(activities)
        .set({ status: 'completed', updatedAt: now })
        .where(and(
            eq(activities.type, 'one-time'),
            sql`${activities.endDateTime} < ${now}`,
            eq(activities.status, 'live')
        ))
        .execute();

    const cleanedUp = await cleanupAbandonedPayments(now);
    if (cleanedUp > 0) {
        console.log(`Cleaned up ${cleanedUp} abandoned pending payment(s)`);
    }
    return c.json({ message: 'Activity statuses updated' });
});

export default app;
