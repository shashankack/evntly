import { Hono } from 'hono';
import { cors } from 'hono/cors';
import clubsRouter from './routes/clubs';
import activitiesRouter from './routes/activities';
import registerRouter from './routes/register';
import clubRegisterRouter from './routes/clubRegister';
import organizerRegistrationsRouter from './routes/organizerRegistrations';
import generatePasswordHashRouter from './routes/generatePasswordHash';

const app = new Hono();

// Configure CORS
app.use(
	'*',
	cors({
		origin: (origin) => {
			const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map((o) => o.trim());

			// Allow requests with no origin (mobile apps, Postman, etc.)
			if (!origin) return '*';

			// Check if origin is in allowed list
			if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
				return origin;
			}

			return allowedOrigins[0]; // Default to first allowed origin
		},
		allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
	allowHeaders: ['Content-Type', 'X-Requested-With', 'ngrok-skip-browser-warning'],
		exposeHeaders: ['Content-Length', 'X-Request-Id'],
		maxAge: 86400, // 24 hours
		credentials: true,
	})
);

// Health check
app.get('/', (c) => {
	return c.json({
		message: 'Evntly API is running! 🎉',
		version: '2.0.0',
		timestamp: new Date().toISOString(),
	});
});

// Mount routes (all use domain-based authentication via originResolver)
app.route('/', clubsRouter);
app.route('/', activitiesRouter);
app.route('/', registerRouter);
app.route('/', clubRegisterRouter);
app.route('/', organizerRegistrationsRouter);
app.route('/', generatePasswordHashRouter);

// 404 handler
app.notFound((c) => {
	return c.json({ error: 'Not Found' }, 404);
});


// Error handler
app.onError((err, c) => {
	console.error('Unhandled error:', err);
	return c.json({ error: 'Internal Server Error' }, 500);
});

export default app;

// (Removed duplicate default export; app is now exported for worker.ts)
