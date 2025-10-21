import { Hono } from 'hono';
import { cors } from 'hono/cors';
import clubsRouter from './routes/clubs';
import activitiesRouter from './routes/activities';
import registerRouter from './routes/register';
import clubRegisterRouter from './routes/clubRegister';
import organizersRouter from './routes/organizers';

const app = new Hono();

// Enable CORS
app.use('*', cors());

// Health check
app.get('/', (c) => {
	return c.json({ 
		message: 'Evntly API is running!',
		version: '1.0.0',
		timestamp: new Date().toISOString()
	});
});

// Mount routes
app.route('/', clubsRouter);
app.route('/', activitiesRouter);
app.route('/', registerRouter);
app.route('/', clubRegisterRouter);
app.route('/', organizersRouter);

// 404 handler
app.notFound((c) => {
	return c.json({ error: 'Not Found' }, 404);
});

// Error handler
app.onError((err, c) => {
	console.error('Unhandled error:', err);
	return c.json({ error: 'Internal Server Error' }, 500);
});

export default {
	async fetch(request: Request, env: any, ctx: any): Promise<Response> {
		return app.fetch(request, env, ctx);
	},
	
	// Scheduled handler for cron jobs (auto-rotate keys)
	async scheduled(event: any, env: any, ctx: any): Promise<void> {
		console.log('Running scheduled task: auto-rotate keys');
		
		try {
			// Call the auto-rotate endpoint
			const response = await app.request('/organizers/auto-rotate', {
				method: 'GET',
				headers: {
					'x-cron-secret': env.CRON_SECRET || process.env.CRON_SECRET || 'default-secret',
				},
			});
			
			const result = await response.json();
			console.log('Auto-rotation result:', result);
		} catch (error) {
			console.error('Auto-rotation failed:', error);
		}
	},
} satisfies ExportedHandler<Env>;
