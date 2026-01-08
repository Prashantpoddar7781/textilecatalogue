# TextileHub Backend API

RESTful API backend for TextileHub built with Express.js, Prisma, and PostgreSQL.

## Features

- 🔐 JWT-based authentication
- 📦 CRUD operations for textile designs
- 🔍 Advanced filtering and search
- 📊 Pagination support
- 🗄️ PostgreSQL database with Prisma ORM
- 🚀 Ready for Railway deployment

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL database
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```
DATABASE_URL="postgresql://user:password@localhost:5432/textilehub?schema=public"
JWT_SECRET="your-super-secret-jwt-key"
FRONTEND_URL="http://localhost:3000"
PORT=3001
NODE_ENV="development"
```

3. Set up database:
```bash
# Generate Prisma Client
npm run db:generate

# Run migrations
npm run db:migrate
```

4. Start the server:
```bash
npm run dev
```

The API will be available at `http://localhost:3001`

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Designs

- `GET /api/designs` - Get all designs (with filters)
- `GET /api/designs/:id` - Get single design
- `POST /api/designs` - Create design (auth required)
- `PUT /api/designs/:id` - Update design (auth required, owner only)
- `DELETE /api/designs/:id` - Delete design (auth required, owner only)
- `GET /api/designs/meta/fabrics` - Get unique fabric types

### Users

- `GET /api/users/me` - Get current user profile
- `GET /api/users/me/designs` - Get current user's designs

## Query Parameters

### GET /api/designs

- `fabric` - Filter by fabric type
- `minPrice` - Minimum retail price
- `maxPrice` - Maximum retail price
- `search` - Search in description and fabric
- `sortBy` - Sort order: `newest`, `price-low`, `price-high`
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50)

## Authentication

Include the JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

## Deployment to Railway

1. Push your code to GitHub
2. Create a new project on Railway
3. Add PostgreSQL service
4. Set environment variables:
   - `DATABASE_URL` (from PostgreSQL service)
   - `JWT_SECRET` (generate a strong secret)
   - `FRONTEND_URL` (your frontend URL)
   - `NODE_ENV=production`
5. Deploy!

Railway will automatically:
- Install dependencies
- Run Prisma migrations
- Start the server

## Development

- `npm run dev` - Start development server with watch mode
- `npm run db:migrate` - Run database migrations
- `npm run db:generate` - Generate Prisma Client
- `npm run db:studio` - Open Prisma Studio (database GUI)

