// src/utils/idGenerator.ts

/**
 * Generate a random numeric ID
 * Returns a 10-digit random number
 */
export function generateRandomId(): number {
	// Generate random 10-digit number (between 1000000000 and 9999999999)
	return Math.floor(1000000000 + Math.random() * 9000000000);
}

/**
 * Generate a cryptographically secure random ID
 * Uses crypto.getRandomValues for better randomness
 */
export function generateSecureRandomId(): number {
	// Generate 10-digit random number using crypto
	const array = new Uint32Array(1);
	crypto.getRandomValues(array);
	// Scale to 10 digits
	return 1000000000 + (array[0] % 9000000000);
}
