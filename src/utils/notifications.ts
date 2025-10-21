// src/utils/notifications.ts
import { sendOrganizerEmail } from './email';
import { getRegistrationEmailHTML, getRegistrationEmailSubject } from '../templates/registrationEmail';

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

/**
 * Send registration confirmation email to a user
 * This is sent from the organizer's email address
 */
export async function sendRegistrationConfirmation(
	params: SendRegistrationEmailParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
	const {
		organizerEmail,
		organizationName,
		userEmail,
		userName,
		activityName,
		ticketCount,
		venueName,
		additionalInfo,
	} = params;

	const emailHTML = getRegistrationEmailHTML({
		userName,
		activityName,
		organizationName,
		ticketCount,
		registrationDate: new Date().toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		}),
		venueName,
		additionalInfo,
	});

	const subject = getRegistrationEmailSubject(activityName);

	return sendOrganizerEmail(organizerEmail, userEmail, subject, emailHTML);
}
