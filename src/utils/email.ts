// src/utils/email.ts
import { Resend } from 'resend';
import { getRegistrationEmailHTML, getRegistrationEmailSubject, getRegistrationEmailText } from '../templates/registrationEmail';

const resend = new Resend(process.env.RESEND_API_KEY);

// System email for sending auth/token related emails to organizers
const SYSTEM_EMAIL = process.env.SYSTEM_EMAIL || 'system@evntly.app';

export interface EmailOptions {
	to: string | string[];
	subject: string;
	html: string;
	text?: string;
	from?: string;
	replyTo?: string;
}

/**
 * Send an email using Resend
 * @param options - Email configuration
 * @returns Promise with email send result
 */
export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
	try {
		const { data, error } = await resend.emails.send({
			from: options.from || SYSTEM_EMAIL,
			to: Array.isArray(options.to) ? options.to : [options.to],
			subject: options.subject,
			html: options.html,
			text: options.text,
			replyTo: options.replyTo,
		});

		if (error) {
			console.error('Email send error:', error);
			return { success: false, error: error.message };
		}

		return { success: true, messageId: data?.id };
	} catch (error) {
		console.error('Email service error:', error);
		return { success: false, error: String(error) };
	}
}

/**
 * Send a system email (for token rotation, auth, etc.)
 * Always sent from system email address
 */
export async function sendSystemEmail(
	to: string | string[],
	subject: string,
	html: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
	return sendEmail({
		to,
		subject,
		html,
		from: SYSTEM_EMAIL,
	});
}

/**
 * Send an organizer email (for user registrations, newsletters, payments, etc.)
 * Sent from organizer's configured email address
 */
export async function sendOrganizerEmail(
	organizerEmail: string,
	to: string | string[],
	subject: string,
	html: string,
	replyTo?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
	return sendEmail({
		to,
		subject,
		html,
		from: organizerEmail,
		replyTo: replyTo || organizerEmail,
	});
}

/**
 * Send registration confirmation email to user
 * @param userEmail - Email address to send to
 * @param userName - Name of the user
 * @param activityName - Name of the activity
 * @param organizationName - Name of the organization
 * @param organizerEmail - Organizer's email (used as sender)
 * @param ticketCount - Number of tickets
 * @param venueName - Venue name (optional)
 * @param additionalInfo - Additional info (optional)
 * @param organizerResendApiKey - Organizer's Resend API key (optional)
 * @param organizerSystemEmail - Organizer's system/no-reply email (optional)
 */
export async function sendRegistrationEmail(
	userEmail: string,
	userName: string,
	activityName: string,
	organizationName: string,
	organizerEmail: string,
	ticketCount: number,
	venueName?: string,
	additionalInfo?: string,
	organizerResendApiKey?: string | null,
	organizerSystemEmail?: string | null
): Promise<{ success: boolean; messageId?: string; error?: string }> {
	const registrationDate = new Date().toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});

	const html = getRegistrationEmailHTML({
		userName,
		activityName,
		organizationName,
		ticketCount,
		registrationDate,
		venueName,
		additionalInfo,
	});

	const text = getRegistrationEmailText({
		userName,
		activityName,
		organizationName,
		ticketCount,
		registrationDate,
		venueName,
		additionalInfo,
	});

	const subject = getRegistrationEmailSubject(activityName);

	// Use organizer's Resend API key if available
	if (organizerResendApiKey) {
		try {
			console.log('📧 Using organizer Resend API key to send email');
			console.log('From email:', organizerSystemEmail || organizerEmail);
			console.log('To email:', userEmail);
			console.log('Organization:', organizationName);

			const organizerResend = new Resend(organizerResendApiKey);
			// Use system email if available, otherwise use organizer email
			const fromEmail = organizerSystemEmail || organizerEmail;

			const { data, error } = await organizerResend.emails.send({
				from: `${organizationName} <${fromEmail}>`,
				to: userEmail,
				subject,
				html,
				text,
				replyTo: organizerEmail,
			});

			if (error) {
				console.error('❌ Email send error with organizer API key:', error);
				console.error('Error details:', JSON.stringify(error, null, 2));
				return { success: false, error: error.message };
			}

			console.log('✅ Email sent successfully! Message ID:', data?.id);
			return { success: true, messageId: data?.id };
		} catch (error) {
			console.error('❌ Email service exception with organizer API key:', error);
			console.error('Exception details:', error);
			return { success: false, error: String(error) };
		}
	}

	// Fallback: send from system email
	return sendEmail({
		to: userEmail,
		subject,
		html,
		text,
		from: `${organizationName} <${SYSTEM_EMAIL}>`,
		replyTo: organizerEmail,
	});
}
