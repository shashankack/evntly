// src/utils/notifications.ts
// Note: Email notifications are now handled directly via sendRegistrationEmail in email.ts
// This file is kept for potential future notification features (SMS, push notifications, etc.)

export interface SendRegistrationEmailParams {
	organizerEmail: string;
	organizationName: string;
	userEmail: string;
	userName: string;
	activityName: string;
	ticketCount: number;
	venueName?: string;
	additionalInfo?: string;
}

// Placeholder for future notification methods
