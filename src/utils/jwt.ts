// src/utils/jwt.ts
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const TOKEN_EXPIRY = '14d'; // 14 days

export interface JWTPayload {
	organizerId: number;
	organizationName: string;
	email: string;
	iat?: number;
	exp?: number;
}

/**
 * Generate a JWT token for an organizer
 * @param payload - Organizer details to encode in token
 * @returns JWT token string
 */
export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
	return jwt.sign(payload, JWT_SECRET, {
		expiresIn: TOKEN_EXPIRY,
		issuer: 'evntly-api',
		audience: 'evntly-organizers',
	});
}

/**
 * Verify and decode a JWT token
 * @param token - JWT token string
 * @returns Decoded payload or null if invalid
 */
export function verifyToken(token: string): JWTPayload | null {
	try {
		const decoded = jwt.verify(token, JWT_SECRET, {
			issuer: 'evntly-api',
			audience: 'evntly-organizers',
		}) as JWTPayload;
		return decoded;
	} catch (error) {
		console.error('JWT verification failed:', error);
		return null;
	}
}

/**
 * Decode a JWT token without verification (useful for debugging)
 * @param token - JWT token string
 * @returns Decoded payload or null
 */
export function decodeToken(token: string): JWTPayload | null {
	try {
		return jwt.decode(token) as JWTPayload;
	} catch (error) {
		console.error('JWT decode failed:', error);
		return null;
	}
}

/**
 * Check if a token is expired
 * @param token - JWT token string
 * @returns true if expired, false otherwise
 */
export function isTokenExpired(token: string): boolean {
	const decoded = decodeToken(token);
	if (!decoded || !decoded.exp) return true;
	
	const now = Math.floor(Date.now() / 1000);
	return decoded.exp < now;
}

/**
 * Get token expiry date
 * @param token - JWT token string
 * @returns Date object or null
 */
export function getTokenExpiry(token: string): Date | null {
	const decoded = decodeToken(token);
	if (!decoded || !decoded.exp) return null;
	
	return new Date(decoded.exp * 1000);
}
