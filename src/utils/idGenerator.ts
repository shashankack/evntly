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
 * Generate a cryptographically secure UUID (v4)
 */
export function generateSecureRandomId(): string {
	// Use crypto API to generate a UUID v4 string
	// https://stackoverflow.com/a/2117523/6463558
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}
