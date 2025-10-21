// src/middleware/originResolver.ts
import { MiddlewareHandler } from 'hono';
import { db } from '../db/client';
import { organizers } from '../db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Normalize a domain string by removing protocol, www prefix, and trailing slashes
 * @param origin - Raw origin or host header value
 * @returns Normalized domain string or null
 */
export function normalizeDomain(origin: string): string | null {
	if (!origin) return null;

	try {
		// Remove protocol if present
		let domain = origin.replace(/^https?:\/\//, '');

		// Remove port number if present
		domain = domain.split(':')[0];

		// Remove trailing slash
		domain = domain.replace(/\/$/, '');

		// Convert to lowercase
		domain = domain.toLowerCase();

		// Remove www. prefix (optional, can be configured)
		domain = domain.replace(/^www\./, '');

		return domain || null;
	} catch (error) {
		console.error('Error normalizing domain:', error);
		return null;
	}
}

/**
 * Middleware to resolve organizer from request origin/host
 * Used for public frontend requests to scope data to the requesting organizer's domain
 * This does NOT provide authentication - use organizerAuth for protected endpoints
 */
export const originResolver: MiddlewareHandler = async (c, next) => {
	try {
		// Try Origin header first (set by browsers for cross-origin requests)
		let origin = c.req.header('Origin');

		// Fallback to Host header
		if (!origin) {
			origin = c.req.header('Host');
		}

		// Normalize the domain
		const domain = normalizeDomain(origin || '');

		if (!domain) {
			// No valid domain found - continue without setting organizer
			// Endpoints should handle missing organizer gracefully
			await next();
			return;
		}

		// Query organizer by website domain
		const [organizer] = await db
			.select()
			.from(organizers)
			.where(and(eq(organizers.websiteDomain, domain), eq(organizers.isActive, true)))
			.limit(1)
			.execute();

		// If organizer found, attach to context
		if (organizer) {
			c.set('organizer', organizer);
			console.log(`✅ Resolved organizer "${organizer.organizationName}" for domain: ${domain}`);
		} else {
			console.log(`⚠️ No organizer found for domain: ${domain}`);
		}

		await next();
	} catch (error) {
		console.error('Error in originResolver middleware:', error);
		// Don't fail the request - just continue without organizer
		await next();
	}
};
