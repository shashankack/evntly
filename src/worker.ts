// src/worker.ts

import { db } from './db/client';
import { activities } from './db/schema';
import { eq, and, sql } from 'drizzle-orm';
import app from './index';

type ActivityType = 'one-time' | 'recurring';
type ActivityStatus = 'upcoming' | 'live' | 'completed';

interface ScheduledEvent {
    cron?: string;
    scheduledTime?: string | Date;
    [key: string]: unknown;
}

interface Env {
    [key: string]: unknown;
}

interface Context {
    waitUntil?: (p: Promise<unknown>) => void;
    passThroughOnException?: () => void;
    [key: string]: unknown;
}


export default {
    fetch(request: Request, env: any, ctx: any) {
        return app.fetch(request, env, ctx);
    },
    
    async scheduled(event: ScheduledEvent, env: Env, ctx: Context): Promise<void> {
        console.log('Cron job started at', new Date().toISOString());
        try {
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
            console.log('Cron job finished successfully at', new Date().toISOString());
        } catch (err) {
            console.error('Error in cron job:', err);
        }
    }
};
