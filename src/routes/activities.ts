// Helper to omit club id and organizerId
function omitClubIds(club: Record<string, any>) {
	if (!club) return club;
	const { id, organizerId, ...rest } = club;
	return rest;
}
// src/routes/activities.ts
import { Hono } from 'hono';
import { db } from '../db/client';
import { organizers, clubs, activities, activitySchedules } from '../db/schema';
import { eq, and, inArray, asc, desc, sql, gte, lte } from 'drizzle-orm';
import { originResolver } from '../middleware/originResolver';
import { generateSecureRandomId } from '../utils/idGenerator';

interface Env {
	Variables: {
		organizer: any;
	};
}

const app = new Hono<Env>();

// Use domain-based authentication for all routes
app.use('*', originResolver);

// Helper function to calculate current status for recurring activities
function getRecurringActivityStatus(schedules: any[]): 'upcoming' | 'live' | 'completed' {
	const now = new Date();
	const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
	const currentTime = now;

	// Find today's schedule
	const todaySchedule = schedules.find((s) => s.dayOfWeek === currentDay);

	if (todaySchedule) {
		// Create start and end times for today using the stored times
		const startTime = new Date(now);
		startTime.setHours(
			todaySchedule.startTime.getHours(),
			todaySchedule.startTime.getMinutes(),
			todaySchedule.startTime.getSeconds() || 0,
			0
		);
		const endTime = new Date(now);
		endTime.setHours(todaySchedule.endTime.getHours(), todaySchedule.endTime.getMinutes(), todaySchedule.endTime.getSeconds() || 0, 0);

		// Check if we're currently in the live time slot
		if (currentTime >= startTime && currentTime <= endTime) {
			return 'live';
		}

		// If current time is before start time, it's upcoming
		if (currentTime < startTime) {
			return 'upcoming';
		}
	}

	// Check if there's any upcoming schedule this week
	const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const currentDayIndex = now.getDay();
	const daysLeft = 6 - currentDayIndex;

	for (let i = 1; i <= daysLeft; i++) {
		const checkDayIndex = currentDayIndex + i;
		const checkDay = daysOfWeek[checkDayIndex];
		const upcomingSchedule = schedules.find((s) => s.dayOfWeek === checkDay);

		if (upcomingSchedule) {
			return 'upcoming';
		}
	}

	// If no upcoming schedules found this week, show as completed
	return 'completed';
}

// -----------------------------
// GET /activities
// List all activities for the organizer
// Supports query filters, pagination, and sorting
// For recurring activities, dynamically calculate status
// -----------------------------

app.get('/activities', async (c) => {
	try {
		const organizer = c.get('organizer');
		if (!organizer) {
			return c.json({ error: 'No organizer found for this domain' }, 404);
		}
		// Extract query parameters
		const { status, type, clubId, page = '1', limit = '10', sortBy = 'createdAt', order = 'desc', fields } = c.req.query();
		const conditions = [eq(activities.organizerId, organizer.id), eq(activities.isActive, true)];
		if (clubId) {
			conditions.push(eq(activities.clubId, clubId));
		}
		// Note: status filtering will be done after calculating dynamic status
		const requestedStatus = status;
		const validStatuses = ['upcoming', 'live', 'completed', 'canceled'] as const;
		
		const validTypes = ['one-time', 'recurring'] as const;
		if (type && validTypes.includes(type as (typeof validTypes)[number]))
			conditions.push(eq(activities.type, type as (typeof validTypes)[number]));
		const pageNum = Math.max(Number(page), 1);
		const limitNum = Math.min(Number(limit), 100);
		const offset = (pageNum - 1) * limitNum;
		const sortMap: Record<string, any> = {
			createdAt: activities.createdAt,
			startDateTime: activities.startDateTime,
		};
		const sortColumn = sortMap[sortBy] || activities.createdAt;
		const sortOrder = order.toLowerCase() === 'asc' ? asc(sortColumn) : desc(sortColumn);
		
		// Fetch more than needed since we'll filter by dynamic status after
		const fetchLimit = requestedStatus ? limitNum * 10 : limitNum;
		const activitiesList = await db
			.select()
			.from(activities)
			.where(and(...conditions))
			.orderBy(sortOrder)
			.limit(fetchLimit)
			.offset(offset)
			.execute();

		// Parse fields param if present
		let fieldList: string[] | null = null;
		if (fields && typeof fields === 'string') {
			fieldList = fields.split(',').map(f => f.trim()).filter(Boolean);
		}

		// For recurring activities, fetch schedules and calculate dynamic status
		let enrichedActivities = await Promise.all(
			activitiesList.map(async (activity) => {
				let result = { ...activity };
				if (activity.type === 'recurring') {
					const schedules = await db.select().from(activitySchedules).where(eq(activitySchedules.activityId, activity.id)).execute();
					const dynamicStatus = getRecurringActivityStatus(schedules);
					result = {
						...result,
						schedules,
						currentStatus: dynamicStatus,
					};
				} else if (activity.type === 'one-time') {
					// Dynamically calculate status for one-time activities
					const now = new Date();
					let dynamicStatus: 'upcoming' | 'live' | 'completed' = 'upcoming';
					if (activity.startDateTime && activity.endDateTime) {
						const start = new Date(activity.startDateTime);
						const end = new Date(activity.endDateTime);
						if (now >= start && now <= end) {
							dynamicStatus = 'live';
						} else if (now > end) {
							dynamicStatus = 'completed';
						}
					}
					result = {
						...result,
						currentStatus: dynamicStatus,
					};
				}
				// Omit id fields from each activity
				let clean = omitActivityIds(result);
				// If fieldList is present, filter the fields
				if (fieldList) {
					clean = Object.fromEntries(Object.entries(clean).filter(([k]) => fieldList!.includes(k)));
				}
				return clean;
			})
		);

		// Filter by dynamic status if requested
		if (requestedStatus && validStatuses.includes(requestedStatus as any)) {
			enrichedActivities = enrichedActivities.filter(
				(activity) => activity.currentStatus === requestedStatus
			);
		}

		// Sort by startDateTime if requested (after enrichment)
		if (sortBy === 'startDateTime') {
			enrichedActivities.sort((a, b) => {
				const dateA = a.startDateTime ? new Date(a.startDateTime).getTime() : 0;
				const dateB = b.startDateTime ? new Date(b.startDateTime).getTime() : 0;
				return order.toLowerCase() === 'asc' ? dateA - dateB : dateB - dateA;
			});
		}

		// Apply pagination after filtering
		const paginatedActivities = enrichedActivities.slice(0, limitNum);

		return c.json({ activities: paginatedActivities }, 200);
	} catch (error) {
		console.error('Error fetching activities:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// -----------------------------
// GET /activities/:id
// Get detailed info of a single activity
// For recurring activities, include schedules and dynamic status
// -----------------------------

app.get('/activities/:slug', async (c) => {
	try {
		const organizer = c.get('organizer');
		const activitySlug = c.req.param('slug');
		if (!activitySlug || typeof activitySlug !== 'string') return c.json({ error: 'Invalid activity slug' }, 400);
		// Ensure the activity belongs to this organizer
		const activityQuery = await db
			.select()
			.from(activities)
			.leftJoin(clubs, eq(clubs.id, activities.clubId))
			.where(and(eq(activities.slug, activitySlug), sql`(${activities.clubId} IS NULL OR ${clubs.organizerId} = ${organizer.id})`))
			.limit(1)
			.execute();
		const activity = activityQuery[0];
		if (!activity) return c.json({ error: 'Activity not found' }, 404);
		let result: any = { ...activity.activities };
		if (activity.activities.type === 'recurring') {
			const schedules = await db.select().from(activitySchedules).where(eq(activitySchedules.activityId, activity.activities.id)).execute();
			const dynamicStatus = getRecurringActivityStatus(schedules);
			result = { ...result, schedules, currentStatus: dynamicStatus };
		} else if (activity.activities.type === 'one-time') {
			// Dynamically calculate status for one-time activities
			const now = new Date();
			let dynamicStatus: 'upcoming' | 'live' | 'completed' = 'upcoming';
			if (activity.activities.startDateTime && activity.activities.endDateTime) {
				const start = new Date(activity.activities.startDateTime);
				const end = new Date(activity.activities.endDateTime);
				if (now >= start && now <= end) {
					dynamicStatus = 'live';
				} else if (now > end) {
					dynamicStatus = 'completed';
				}
			}
			result = { ...result, currentStatus: dynamicStatus };
		}
		// Remove id fields from activity and club
		const cleanClub = activity.clubs ? omitClubIds(activity.clubs) : undefined;
		return c.json({ activity: { ...omitActivityIds(result), club: cleanClub } }, 200);
	} catch (error) {
		console.error('Error fetching activity:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// -----------------------------
// DELETE /activities/:id
// Soft delete an activity
// -----------------------------
app.delete('/activities/:slug', async (c) => {
	try {
		const organizer = c.get('organizer');

		if (!organizer) {
			return c.json({ error: 'No organizer found for this domain' }, 404);
		}

		const activitySlug = c.req.param('slug');
		if (!activitySlug || typeof activitySlug !== 'string') return c.json({ error: 'Invalid activity slug' }, 400);

		// Verify activity belongs to organizer
		const activityQuery = await db
			.select()
			.from(activities)
			.innerJoin(clubs, eq(clubs.id, activities.clubId))
			.where(and(eq(activities.slug, activitySlug), eq(clubs.organizerId, organizer.id)))
			.limit(1)
			.execute();

		if (!activityQuery[0]) return c.json({ error: 'Activity not found' }, 404);

		// Soft delete
		await db
			.update(activities)
			.set({
				isActive: false,
				deletedAt: new Date(),
			})
			.where(eq(activities.slug, activitySlug))
			.execute();

		return c.json({ message: 'Activity deleted successfully' }, 200);
	} catch (error) {
		console.error('Error deleting activity:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// -----------------------------
// PATCH /activities/:id/status
// Update activity status manually (for one-time activities)
// For recurring, status is calculated dynamically
// -----------------------------
app.patch('/activities/:slug/status', async (c) => {
	try {
		const organizer = c.get('organizer');
		const activitySlug = c.req.param('slug');
		if (!activitySlug || typeof activitySlug !== 'string') return c.json({ error: 'Invalid activity slug' }, 400);

		const { status } = await c.req.json();
		const validStatuses = ['upcoming', 'live', 'completed', 'canceled'] as const;

		if (!status || !validStatuses.includes(status as any)) {
			return c.json({ error: 'Invalid status' }, 400);
		}

		// Verify activity belongs to organizer
		const activityQuery = await db
			.select()
			.from(activities)
			.innerJoin(clubs, eq(clubs.id, activities.clubId))
			.where(and(eq(activities.slug, activitySlug), eq(clubs.organizerId, organizer.id)))
			.limit(1)
			.execute();

		if (!activityQuery[0]) return c.json({ error: 'Activity not found' }, 404);

		const activity = activityQuery[0].activities;

		// Only allow status updates for one-time activities
		if (activity.type === 'recurring') {
			return c.json(
				{
					error: 'Cannot manually update status for recurring activities. Status is calculated dynamically based on schedules.',
				},
				400
			);
		}

		// Update status
		const [updatedActivity] = await db
			.update(activities)
			.set({ status, updatedAt: new Date() })
			.where(eq(activities.slug, activitySlug))
			.returning()
			.execute();

		return c.json({ activity: omitActivityIds(updatedActivity), message: 'Status updated successfully' }, 200);
	} catch (error) {
		console.error('Error updating status:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

function omitActivityIds(result: any): any {
	if (!result) return result;
	// Shallow copy first level excluding common id fields
	const { id, clubId, organizerId, activityId, ...rest } = result;

	// If there are schedules, remove their id/activityId fields as well
	if (Array.isArray(rest.schedules)) {
		rest.schedules = rest.schedules.map((s: any) => {
			if (!s || typeof s !== 'object') return s;
			const { id: _sid, activityId: _sa, ...scheduleRest } = s;
			return scheduleRest;
		});
	}

	// If there are any nested objects that commonly contain ids, strip them too
	if (rest.organizer && typeof rest.organizer === 'object') {
		const { id: _orgId, organizerId: _orgId2, ...orgRest } = rest.organizer;
		rest.organizer = orgRest;
	}

	return rest;
}

export default app;
