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
		console.error('❌❌❌ CRITICAL: No Resend API key provided!');
		console.error('   → Organizer:', organizationName);
		console.error('   → This email CANNOT be sent without an API key');
		return { success: false, error: 'Resend API key not configured for this organizer' };
	}

	try {
		console.log('\n---------- RESEND EMAIL SERVICE ----------');
		console.log('📧 Using organizer Resend API key to send email');
		console.log('🔑 API Key configured:', !!organizerResendApiKey);
		console.log('🔑 API Key length:', organizerResendApiKey.length);
		console.log('🔑 API Key prefix:', organizerResendApiKey.substring(0, 7));
		console.log('📤 From email:', organizerSystemEmail || organizerEmail);
		console.log('📥 To email:', userEmail);
		console.log('🏢 Organization:', organizationName);
		console.log('📝 Subject:', subject);

		console.log('🔧 Initializing Resend client...');
		const organizerResend = new Resend(organizerResendApiKey);
		console.log('✅ Resend client initialized');
		
		// Use system email if available, otherwise use organizer email
		const fromEmail = organizerSystemEmail || organizerEmail;
		console.log('📧 Final from address:', `${organizationName} <${fromEmail}>`);

		const emailPayload = {
			from: `${organizationName} <${fromEmail}>`,
			to: userEmail,
			subject,
			html,
			text,
			replyTo: organizerEmail,
		};

		console.log('📦 Email payload prepared:', {
			from: emailPayload.from,
			to: emailPayload.to,
			subject: emailPayload.subject,
			replyTo: emailPayload.replyTo,
			htmlLength: html.length,
			textLength: text?.length || 0,
		});

		console.log('🚀 Calling Resend API...');
		const { data, error } = await organizerResend.emails.send(emailPayload);
		console.log('📥 Resend API response received');

		if (error) {
			console.error('❌❌❌ Email send ERROR from Resend API!');
			console.error('Error object:', error);
			console.error('Error details:', JSON.stringify(error, null, 2));
			console.error('Error message:', error.message);
			console.log('---------- RESEND EMAIL FAILED ----------\n');
			return { success: false, error: error.message };
		}

		console.log('✅✅✅ Email sent successfully via Resend!');
		console.log('📬 Message ID:', data?.id);
		console.log('📊 Response data:', JSON.stringify(data, null, 2));
		console.log('---------- RESEND EMAIL SUCCESS ----------\n');
		return { success: true, messageId: data?.id };
	} catch (error) {
		console.error('❌❌❌ EXCEPTION in email service!');
		console.error('Exception type:', error?.constructor?.name);
		console.error('Exception message:', (error as Error)?.message);
		console.error('Exception details:', error);
		console.error('Exception stack:', (error as Error)?.stack);
		console.log('---------- RESEND EMAIL EXCEPTION ----------\n');
		return { success: false, error: String(error) };
	}
}
