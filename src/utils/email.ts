// src/utils/email.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// System email for sending auth/token related emails to organizers
const SYSTEM_EMAIL = process.env.SYSTEM_EMAIL || 'system@evntly.app';

export interface EmailOptions {
	to: string | string[];
	subject: string;
	html: string;
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
export async function sendSystemEmail(to: string | string[], subject: string, html: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
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
