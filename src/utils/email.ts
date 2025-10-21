// src/utils/email.ts
import { Resend } from 'resend';
import { getRegistrationEmailHTML, getRegistrationEmailSubject, getRegistrationEmailText } from '../templates/registrationEmail';

// Note: Resend API key is fetched from the organizers table in the database
// No default Resend client is initialized here to avoid deployment errors

export interface EmailOptions {
	to: string | string[];
	subject: string;
	html: string;
	text?: string;
	from: string;
	replyTo?: string;
	resendApiKey: string;
}

/**
 * Send an email using Resend with the provided API key
 * @param options - Email configuration including the Resend API key
 * @returns Promise with email send result
 */
export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
	try {
		const resend = new Resend(options.resendApiKey);
		const { data, error } = await resend.emails.send({
			from: options.from,
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

	// Resend API key is required - must be fetched from organizers table
	if (!organizerResendApiKey) {
		console.error('❌ No Resend API key provided for organizer:', organizationName);
		return { success: false, error: 'Resend API key not configured for this organizer' };
	}

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
