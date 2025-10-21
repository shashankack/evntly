# Evntly - Event Management API

A modern, secure event management API built with Hono, Cloudflare Workers, and PostgreSQL.

## ✨ Features

- 🔐 **JWT-based Authentication** with automatic 14-day rotation
- 📧 **Dual Email System** (System & Organizer emails via Resend)
- 🏢 **Multi-tenant Architecture** with data isolation
- 🎫 **Event & Club Management** with user registration
- 💳 **Payment Integration** support (Razorpay/Manual)
- ⚡ **Serverless** deployment on Cloudflare Workers
- 🗄️ **PostgreSQL** database with Drizzle ORM
- 🔄 **Auto-rotation** of secret keys via cron jobs

## 🚀 Quick Start

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd evntly

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your credentials

# 4. Run database migrations
npm run db:push

# 5. Start development server
npm run dev
```

Your API will be running at `http://localhost:8787`

## 📚 Documentation

- **[Quick Reference](QUICK_REFERENCE.md)** - Command cheat sheet
- **[Setup Guide](SETUP_GUIDE.md)** - Detailed installation instructions
- **[Secret Key System](SECRET_KEY_SYSTEM.md)** - Authentication & email documentation
- **[Implementation](IMPLEMENTATION.md)** - Technical implementation details

## 🔑 Environment Variables

Create a `.dev.vars` file with these variables:

```bash
# Database
DATABASE_URL=postgresql://user:pass@host.neon.tech/dbname

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Email (Resend)
RESEND_API_KEY=re_your_resend_api_key
SYSTEM_EMAIL=system@yourdomain.com

# Cron Protection
CRON_SECRET=your-cron-secret

# Optional
PAYMENT_METHOD=manual
FRONTEND_URL=https://yourdomain.com
```

## 📖 API Endpoints

### Public Endpoints

```
GET  /                           Health check
POST /organizers/register        Register new organizer
POST /activities/:id/register    Register for activity
POST /clubs/:id/register         Join a club
```

### Protected Endpoints (requires `x-secret-key` header)

```
GET  /organizers/me              Get current organizer
POST /organizers/rotate-key      Manual key rotation
GET  /clubs                      List clubs
GET  /clubs/:id                  Get club details
GET  /activities                 List activities
GET  /activities/:id             Get activity details
```

### Cron Endpoints (requires `x-cron-secret` header)

```
GET  /organizers/auto-rotate     Auto-rotate expired keys
```

## 🏗️ Architecture

```
src/
├── db/
│   ├── client.ts          # Database connection
│   └── schema.ts          # Database schema
├── middleware/
│   └── organizerAuth.ts   # JWT authentication
├── routes/
│   ├── activities.ts      # Activity management
│   ├── clubs.ts           # Club management
│   ├── clubRegister.ts    # Club membership
│   ├── register.ts        # Activity registration
│   └── organizers.ts      # Organizer management
├── templates/
│   ├── secretKeyEmail.ts      # Token email template
│   └── registrationEmail.ts   # Registration email template
├── utils/
│   ├── jwt.ts             # JWT utilities
│   ├── email.ts           # Email service
│   └── notifications.ts   # Notification helpers
└── index.ts               # Main application
```

## 🗄️ Database Schema

- **users** - User accounts
- **organizers** - Organization accounts with JWT tokens
- **clubs** - Clubs managed by organizers
- **activities** - Events and activities
- **activity_registrations** - User registrations
- **club_members** - Club memberships
- **payments** - Payment records
- **notifications** - Email notifications

## 🔒 Security Features

- ✅ JWT tokens with cryptographic signing
- ✅ 14-day automatic expiration
- ✅ Automatic key rotation every 14 days
- ✅ Multi-tenant data isolation
- ✅ Protected cron endpoints
- ✅ Email notifications for all key changes
- ✅ Database token validation

## 📧 Email System

### System Emails
Sent from configured system email for:
- Secret key generation
- Secret key rotation
- Authentication notifications

### Organizer Emails
Sent from organizer's email for:
- User registration confirmations
- Newsletters
- Payment notifications

## 🚀 Deployment

### Cloudflare Workers

```bash
# Login to Cloudflare
npx wrangler login

# Set production secrets
npx wrangler secret put DATABASE_URL
npx wrangler secret put JWT_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put CRON_SECRET
npx wrangler secret put SYSTEM_EMAIL

# Deploy
npm run deploy
```

The cron job for automatic key rotation is configured to run daily at midnight UTC.

## 🛠️ Development

```bash
# Start dev server
npm run dev

# Generate database migration
npm run db:create

# Push database changes
npm run db:push

# Run tests
npm test

# Generate TypeScript types for Cloudflare
npm run cf-typegen
```

## 📝 Usage Example

### 1. Register as Organizer

```bash
curl -X POST http://localhost:8787/organizers/register \
  -H "Content-Type: application/json" \
  -d '{
    "organizationName": "Tech Club",
    "organizerEmail": "admin@techclub.com",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

### 2. Check Email for JWT Token

You'll receive an email with your JWT secret key valid for 14 days.

### 3. Use Token in API Calls

```bash
curl http://localhost:8787/clubs \
  -H "x-secret-key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## 🔄 Key Rotation

Keys automatically rotate every 14 days via cron job. You can also manually rotate:

```bash
curl -X POST http://localhost:8787/organizers/rotate-key \
  -H "x-secret-key: YOUR_CURRENT_TOKEN"
```

New keys are sent via email immediately.

## 🧪 Testing

### Manual Testing

See [SETUP_GUIDE.md](SETUP_GUIDE.md) for comprehensive testing steps.

### Integration Tests

```bash
npm test
```

## 📦 Dependencies

- **hono** - Web framework
- **drizzle-orm** - Type-safe ORM
- **@neondatabase/serverless** - PostgreSQL client
- **jsonwebtoken** - JWT token handling
- **resend** - Email service
- **@cloudflare/workers-types** - TypeScript types

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## 📄 License

MIT License - See LICENSE file for details

## 🆘 Support

For issues and questions:

1. Check the documentation in this repository
2. Review error logs in Cloudflare dashboard
3. Verify environment variables are set correctly
4. Test endpoints with the provided examples

## 🔗 Resources

- [Hono Documentation](https://hono.dev)
- [Cloudflare Workers](https://developers.cloudflare.com/workers)
- [Drizzle ORM](https://orm.drizzle.team)
- [Resend](https://resend.com/docs)
- [Neon Database](https://neon.tech/docs)

## 🎯 Roadmap

- [ ] Email verification for organizers
- [ ] Rate limiting
- [ ] API usage analytics
- [ ] Multiple API keys per organizer
- [ ] Webhook notifications
- [ ] Custom email template editor
- [ ] 2FA support
- [ ] Advanced payment integrations

---

Built with ❤️ using Hono, Cloudflare Workers, and modern web technologies.
