import { db } from '../db/client';
import { activities } from '../db/schema';
import { eq, sql } from 'drizzle-orm';

export async function incrementBookedSlotsAndCloseIfFull(activityId: string, ticketCount: number) {
	const [activity] = await db
		.select()
		.from(activities)
		.where(eq(activities.id, activityId))
		.limit(1)
		.execute();

	if (!activity) {
		return null;
	}

	const bookedSlots = activity.bookedSlots ?? 0;
	const availableSlots = activity.availableSlots ?? 0;
	const nextBookedSlots = bookedSlots + ticketCount;
	const shouldCloseRegistration = availableSlots > 0 && nextBookedSlots >= availableSlots;

	await db
		.update(activities)
		.set({
			bookedSlots: sql`${activities.bookedSlots} + ${ticketCount}`,
			isRegistrationOpen: shouldCloseRegistration ? false : activity.isRegistrationOpen,
			updatedAt: new Date(),
		})
		.where(eq(activities.id, activityId))
		.execute();

	return {
		bookedSlots: nextBookedSlots,
		availableSlots,
		isRegistrationOpen: shouldCloseRegistration ? false : activity.isRegistrationOpen,
	};
}