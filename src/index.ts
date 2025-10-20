export default {
	async fetch(request, env, ctx): Promise<Response> {
		return new Response('Evnts Worker says hello!', { status: 200 });
	},
} satisfies ExportedHandler<Env>;
