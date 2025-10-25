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
		startTime.setHours(todaySchedule.startTime.getHours(), todaySchedule.startTime.getMinutes(), todaySchedule.startTime.getSeconds() || 0, 0);
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
		const { status, type, clubId, page = '1', limit = '10', sortBy = 'createdAt', order = 'desc' } = c.req.query();
		const conditions = [eq(activities.organizerId, organizer.id), eq(activities.isActive, true)];
		if (clubId) {
			conditions.push(eq(activities.clubId, clubId));
		}
		const validStatuses = ['upcoming', 'live', 'completed', 'canceled'] as const;
		if (status && validStatuses.includes(status as (typeof validStatuses)[number]))
			conditions.push(eq(activities.status, status as (typeof validStatuses)[number]));
		const validTypes = ['one-time', 'recurring'] as const;
		if (type && validTypes.includes(type as (typeof validTypes)[number]))
			conditions.push(eq(activities.type, type as (typeof validTypes)[number]));
		const pageNum = Math.max(Number(page), 1);
		const limitNum = Math.min(Number(limit), 100);
		const offset = (pageNum - 1) * limitNum;
		const sortMap: Record<string, any> = {
			createdAt: activities.createdAt,
		};
		const sortColumn = sortMap[sortBy] || activities.createdAt;
		const sortOrder = order.toLowerCase() === 'asc' ? asc(sortColumn) : desc(sortColumn);
		const activitiesList = await db
			.select()
			.from(activities)
			.where(and(...conditions))
			.orderBy(sortOrder)
			.limit(limitNum)
			.offset(offset)
			.execute();
		// For recurring activities, fetch schedules and calculate dynamic status
		const enrichedActivities = await Promise.all(
			activitiesList.map(async (activity) => {
				if (activity.type === 'recurring') {
					const schedules = await db.select().from(activitySchedules).where(eq(activitySchedules.activityId, activity.id)).execute();
					const dynamicStatus = getRecurringActivityStatus(schedules);
					return {
						...activity,
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
					return {
						...activity,
						currentStatus: dynamicStatus,
					};
				}
				return activity;
			})
		);
		return c.json({ activities: enrichedActivities }, 200);
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

app.get('/activities/:id', async (c) => {
	try {
		const organizer = c.get('organizer');
		const activityId = c.req.param('id');
		if (!activityId || typeof activityId !== 'string') return c.json({ error: 'Invalid activity id' }, 400);
		// Ensure the activity belongs to this organizer
		const activityQuery = await db
			.select()
			.from(activities)
			.leftJoin(clubs, eq(clubs.id, activities.clubId))
			.where(and(
				eq(activities.id, activityId),
				// Only check organizer if club is present
				sql`(${activities.clubId} IS NULL OR ${clubs.organizerId} = ${organizer.id})`
			))
			.limit(1)
			.execute();
		const activity = activityQuery[0];
		if (!activity) return c.json({ error: 'Activity not found' }, 404);
		if (activity.activities.type === 'recurring') {
			const schedules = await db
				.select()
				.from(activitySchedules)
				.where(eq(activitySchedules.activityId, activityId))
				.execute();
			const dynamicStatus = getRecurringActivityStatus(schedules);
			return c.json({
				activity: {
					...activity.activities,
					club: activity.clubs,
					schedules,
					currentStatus: dynamicStatus,
				},
			}, 200);
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
			return c.json({
				activity: {
					...activity.activities,
					club: activity.clubs,
					currentStatus: dynamicStatus,
				},
			}, 200);
		}
		return c.json({
			activity: {
				...activity.activities,
				club: activity.clubs,
			},
		}, 200);
	} catch (error) {
		console.error('Error fetching activity:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// -----------------------------
// POST /activities
// Create a new activity
// For one-time: requires startDateTime and endDateTime
// For recurring: requires schedules array
// -----------------------------
app.post('/activities', async (c) => {
	try {
		const organizer = c.get('organizer');

		if (!organizer) {
			return c.json({ error: 'No organizer found for this domain' }, 404);
		}
		const body = await c.req.json();

		const {
			clubId,
			name,
			slug,
			description,
			additionalInfo,
			venueName,
			mapUrl,
			imageUrls,
			videoUrls,
			type = 'one-time',
			startDateTime,
			endDateTime,
			schedules, // For recurring activities: [{ dayOfWeek, startTime, endTime }]
			availableSlots,
			registrationFee = 0,
			isRegistrationOpen = true,
		} = body;

		// Validation
		if (!clubId || !name || !slug) {
			return c.json({ error: 'Missing required fields: clubId, name, slug' }, 400);
		}

		// Verify club belongs to organizer
		const [club] = await db
			.select()
			.from(clubs)
			.where(and(eq(clubs.id, clubId), eq(clubs.organizerId, organizer.id)))
			.limit(1)
			.execute();

		if (!club) return c.json({ error: 'Club not found' }, 404);

		// Type-specific validation
		if (type === 'one-time') {
			if (!startDateTime || !endDateTime) {
				return c.json({ error: 'one-time activities require startDateTime and endDateTime' }, 400);
			}
		} else if (type === 'recurring') {
			if (!schedules || !Array.isArray(schedules) || schedules.length === 0) {
				return c.json({ error: 'recurring activities require schedules array' }, 400);
			}
		}

		// Generate unique ID
		const activityId = generateSecureRandomId();

		// Determine initial status
		let initialStatus: 'upcoming' | 'live' | 'completed' = 'upcoming';
		if (type === 'one-time') {
			const now = new Date();
			const start = new Date(startDateTime);
			const end = new Date(endDateTime);

			if (now >= start && now <= end) {
				initialStatus = 'live';
			} else if (now > end) {
				initialStatus = 'completed'; // Past events are completed
			}
		}

		// Insert activity
		const [newActivity] = await db
			.insert(activities)
			.values({
				id: activityId,
				clubId,
				name,
				slug,
				description: description || null,
				additionalInfo: additionalInfo || {},
				venueName: venueName || null,
				mapUrl: mapUrl || null,
				imageUrls: imageUrls || [],
				videoUrls: videoUrls || [],
				type,
				startDateTime: type === 'one-time' ? new Date(startDateTime) : null,
				endDateTime: type === 'one-time' ? new Date(endDateTime) : null,
				availableSlots: availableSlots || 0,
				bookedSlots: 0,
				registrationFee,
				isRegistrationOpen,
				status: initialStatus,
				isActive: true,
			})
			.returning()
			.execute();

		// For recurring activities, insert schedules
		if (type === 'recurring' && schedules && schedules.length > 0) {
			const scheduleValues = schedules.map((schedule: any) => ({
				id: generateSecureRandomId(),
				activityId,
				dayOfWeek: schedule.dayOfWeek,
				startTime: new Date(schedule.startTime),
				endTime: new Date(schedule.endTime),
			}));

			await db.insert(activitySchedules).values(scheduleValues).execute();
		}

		return c.json({ activity: newActivity, message: 'Activity created successfully' }, 201);
	} catch (error) {
		console.error('Error creating activity:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// -----------------------------
// PUT /activities/:id
// Update an existing activity
// -----------------------------
app.put('/activities/:id', async (c) => {
	try {
		const organizer = c.get('organizer');

		if (!organizer) {
			return c.json({ error: 'No organizer found for this domain' }, 404);
		}

		const activityId = c.req.param('id');
		if (!activityId || typeof activityId !== 'string') return c.json({ error: 'Invalid activity id' }, 400);

		const body = await c.req.json();

		// Verify activity belongs to organizer
		const activityQuery = await db
			.select()
			.from(activities)
			.innerJoin(clubs, eq(clubs.id, activities.clubId))
			.where(and(eq(activities.id, activityId), eq(clubs.organizerId, organizer.id)))
			.limit(1)
			.execute();

		if (!activityQuery[0]) return c.json({ error: 'Activity not found' }, 404);

		const existingActivity = activityQuery[0].activities;

		// Build update object
		const updateData: any = {
			updatedAt: new Date(),
		};

		// Allow updating specific fields
		if (body.name !== undefined) updateData.name = body.name;
		if (body.slug !== undefined) updateData.slug = body.slug;
		if (body.description !== undefined) updateData.description = body.description;
		if (body.additionalInfo !== undefined) updateData.additionalInfo = body.additionalInfo;
		if (body.venueName !== undefined) updateData.venueName = body.venueName;
		if (body.mapUrl !== undefined) updateData.mapUrl = body.mapUrl;
		if (body.imageUrls !== undefined) updateData.imageUrls = body.imageUrls;
		if (body.videoUrls !== undefined) updateData.videoUrls = body.videoUrls;
		if (body.availableSlots !== undefined) updateData.availableSlots = body.availableSlots;
		if (body.registrationFee !== undefined) updateData.registrationFee = body.registrationFee;
		if (body.isRegistrationOpen !== undefined) updateData.isRegistrationOpen = body.isRegistrationOpen;
		if (body.status !== undefined) updateData.status = body.status;
		if (body.isActive !== undefined) updateData.isActive = body.isActive;

		// Handle type-specific fields
		if (existingActivity.type === 'one-time') {
			if (body.startDateTime !== undefined) updateData.startDateTime = new Date(body.startDateTime);
			if (body.endDateTime !== undefined) updateData.endDateTime = new Date(body.endDateTime);
		}

		// Update activity
		const [updatedActivity] = await db
			.update(activities)
			.set(updateData)
			.where(eq(activities.id, activityId))
			.returning()
			.execute();

		// Handle schedule updates for recurring activities
		if (existingActivity.type === 'recurring' && body.schedules) {
			// Delete existing schedules
			await db
				.delete(activitySchedules)
				.where(eq(activitySchedules.activityId, activityId))
				.execute();

			// Insert new schedules
			if (body.schedules.length > 0) {
				const scheduleValues = body.schedules.map((schedule: any) => ({
					id: generateSecureRandomId(),
					activityId,
					dayOfWeek: schedule.dayOfWeek,
					startTime: new Date(schedule.startTime),
					endTime: new Date(schedule.endTime),
				}));

				await db.insert(activitySchedules).values(scheduleValues).execute();
			}
		}

		return c.json({ activity: updatedActivity, message: 'Activity updated successfully' }, 200);
	} catch (error) {
		console.error('Error updating activity:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

// -----------------------------
// DELETE /activities/:id
// Soft delete an activity
// -----------------------------
app.delete('/activities/:id', async (c) => {
	try {
		const organizer = c.get('organizer');

		if (!organizer) {
			return c.json({ error: 'No organizer found for this domain' }, 404);
		}

		const activityId = c.req.param('id');
		if (!activityId || typeof activityId !== 'string') return c.json({ error: 'Invalid activity id' }, 400);

		// Verify activity belongs to organizer
		const activityQuery = await db
			.select()
			.from(activities)
			.innerJoin(clubs, eq(clubs.id, activities.clubId))
			.where(and(eq(activities.id, activityId), eq(clubs.organizerId, organizer.id)))
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
			.where(eq(activities.id, activityId))
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
app.patch('/activities/:id/status', async (c) => {
	try {
		const organizer = c.get('organizer');
		const activityId = c.req.param('id');
		if (!activityId || typeof activityId !== 'string') return c.json({ error: 'Invalid activity id' }, 400);

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
			.where(and(eq(activities.id, activityId), eq(clubs.organizerId, organizer.id)))
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
			.where(eq(activities.id, activityId))
			.returning()
			.execute();

		return c.json({ activity: updatedActivity, message: 'Status updated successfully' }, 200);
	} catch (error) {
		console.error('Error updating status:', error);
		return c.json({ error: 'Internal Server Error' }, 500);
	}
});

export default app;
