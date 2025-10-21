import { pgTable, serial, integer, bigint, varchar, timestamp, jsonb, boolean, numeric, text, pgEnum } from 'drizzle-orm/pg-core';

// -------------------- ENUMS --------------------
export const ActivityStatus = pgEnum('activity_status', ['active', 'canceled', 'completed', 'upcoming', 'live']);
export const RegistrationStatus = pgEnum('registration_status', ['registered', 'canceled', 'attended']);
export const PaymentStatus = pgEnum('payment_status', ['pending', 'completed', 'failed']);
export const NotificationStatus = pgEnum('notification_status', ['pending', 'sent', 'failed']);
export const ActivityType = pgEnum('activity_type', ['one-time', 'recurring']);

// -------------------- USERS --------------------
export const users = pgTable('users', {
	id: bigint('id', { mode: 'number' }).primaryKey(),
	firstName: varchar('first_name', { length: 100 }).notNull(),
	lastName: varchar('last_name', { length: 100 }).notNull(),
	phone: varchar('phone', { length: 20 }).unique(),
	email: varchar('email', { length: 255 }).unique(),
	passwordHash: varchar('password_hash', { length: 255 }).default(''),
	socialAccounts: jsonb('social_accounts').default('{}'),
	isActive: boolean('is_active').default(true).notNull(),
	lastLogin: timestamp('last_login'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
	deletedAt: timestamp('deleted_at'),
});

// -------------------- ORGANIZERS --------------------
export const organizers = pgTable('organizers', {
	id: bigint('id', { mode: 'number' }).primaryKey(),
	userId: bigint('user_id', { mode: 'number' }).references(() => users.id),
	secretKey: varchar('secret_key', { length: 500 }).notNull(), // JWT token (longer for JWT)
	organizationName: varchar('organization_name', { length: 255 }).notNull(),
	organizerEmail: varchar('organizer_email', { length: 255 }).notNull(), // Email for sending to users
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
	secretKeyLastRotated: timestamp('secret_key_last_rotated').defaultNow().notNull(),
	deletedAt: timestamp('deleted_at'),
});

// -------------------- CLUBS --------------------
export const clubs = pgTable('clubs', {
	id: bigint('id', { mode: 'number' }).primaryKey(),
	organizerId: bigint('organizer_id', { mode: 'number' }).references(() => organizers.id),
	name: varchar('name', { length: 255 }).notNull(),
	description: text('description'),
	imageUrls: jsonb('image_urls').default('[]'),
	videoUrls: jsonb('video_urls').default('[]'),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
	deletedAt: timestamp('deleted_at'),
});

// -------------------- ACTIVITIES --------------------
export const activities = pgTable('activities', {
	id: bigint('id', { mode: 'number' }).primaryKey(),
	clubId: bigint('club_id', { mode: 'number' }).references(() => clubs.id),
	name: varchar('name', { length: 255 }).notNull(),
	slug: varchar('slug', { length: 255 }).notNull().unique(),
	description: text('description'),
	additionalInfo: jsonb('additional_info').default('{}'),
	venueName: varchar('venue_name', { length: 255 }),
	mapUrl: varchar('map_url', { length: 500 }),
	imageUrls: jsonb('image_urls').default('[]'),
	videoUrls: jsonb('video_urls').default('[]'),
	type: ActivityType('type').default('one-time').notNull(), // 'one-time' or 'recurring'
	startDateTime: timestamp('start_date_time'), // Only used when type='one-time'
	endDateTime: timestamp('end_date_time'), // Only used when type='one-time'
	availableSlots: integer('available_slots').default(0),
	bookedSlots: integer('booked_slots').default(0),
	registrationFee: integer('registration_fee').default(0), // Paise
	isRegistrationOpen: boolean('is_registration_open').default(true).notNull(),
	status: ActivityStatus('status').default('active').notNull(),
	isActive: boolean('is_active').default(true).notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
	deletedAt: timestamp('deleted_at'),
});

// -------------------- ACTIVITY SCHEDULES --------------------
export const activitySchedules = pgTable('activity_schedules', {
	id: bigint('id', { mode: 'number' }).primaryKey(),
	activityId: bigint('activity_id', { mode: 'number' }).references(() => activities.id),
	dayOfWeek: varchar('day_of_week', { length: 10 }).notNull(), // e.g., 'Monday'
	startTime: timestamp('start_time').notNull(),
	endTime: timestamp('end_time').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
	deletedAt: timestamp('deleted_at'),
});

// -------------------- ACTIVITY REGISTRATIONS --------------------
export const activityRegistrations = pgTable('activity_registrations', {
	id: bigint('id', { mode: 'number' }).primaryKey(),
	activityId: bigint('activity_id', { mode: 'number' }).references(() => activities.id),
	userId: bigint('user_id', { mode: 'number' }).references(() => users.id),
	status: RegistrationStatus('status').default('registered').notNull(),
	ticketCount: integer('ticket_count').default(1).notNull(),
	registeredAt: timestamp('registered_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
	deletedAt: timestamp('deleted_at'),
});

// -------------------- CLUB MEMBERS --------------------
export const clubMembers = pgTable('club_members', {
	id: bigint('id', { mode: 'number' }).primaryKey(),
	clubId: bigint('club_id', { mode: 'number' }).references(() => clubs.id),
	userId: bigint('user_id', { mode: 'number' }).references(() => users.id),
	role: varchar('role', { length: 50 }).default('member').notNull(),
	joinedAt: timestamp('joined_at').defaultNow().notNull(),
	isActive: boolean('is_active').default(true).notNull(),
	deletedAt: timestamp('deleted_at'),
});

// -------------------- PAYMENTS --------------------
export const payments = pgTable('payments', {
	id: bigint('id', { mode: 'number' }).primaryKey(),
	registrationId: bigint('registration_id', { mode: 'number' }).references(() => activityRegistrations.id),
	amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
	status: PaymentStatus('status').default('pending').notNull(),
	paymentMethod: varchar('payment_method', { length: 50 }).notNull(),
	providerPaymentId: varchar('provider_payment_id', { length: 100 }),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
	deletedAt: timestamp('deleted_at'),
});

// -------------------- EMAILS / NOTIFICATIONS --------------------
export const notifications = pgTable('notifications', {
	id: bigint('id', { mode: 'number' }).primaryKey(),
	userId: bigint('user_id', { mode: 'number' }).references(() => users.id),
	reason: varchar('reason', { length: 100 }).notNull(),
	status: NotificationStatus('status').default('pending').notNull(),
	sentAt: timestamp('sent_at'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
	deletedAt: timestamp('deleted_at'),
});
