# PantryPal x Fogmen

A full-stack, mobile-first web app: create an account, enter the ingredients
you already have, get matching recipes from Spoonacular, save favorites, and
see an impact estimate tied to the Fogmen hunger-relief initiative.

**Stack:** static HTML/CSS/JS frontend + Netlify Functions (Node.js) backend
+ MySQL database, deployed as one Netlify site with zero servers to manage.

## Features

- Real accounts: bcrypt-hashed passwords, JWT sessions, stored in MySQL
- Ingredient chip input with quick-add suggestions and autocomplete
- Filters: diet, cuisine, max ready time
- "Surprise me" random recipe, plus a cached "Today's pick"
- Recipe details: ingredients you have vs. still need, nutrition bars,
  step-by-step instructions, share button
- Save/unsave recipes — persisted server-side per account
- Recent-search history, persisted server-side
- Impact dashboard with an animated progress ring, computed server-side
  from your saved recipes — clearly labeled as a **prototype estimate**
- Fogmen support page with a demo donation flow, recorded server-side
- Light/dark theme, split-panel auth screen, animated stat counters,
  responsive layout with bottom navigation

## Architecture

```
Browser (public/)
   |  fetch("/api/...")
   v
Netlify redirect  /api/* -> /.netlify/functions/*
   |
   v
Netlify Functions (netlify/functions/)
 |- auth-signup.js, auth-login.js        -> users table (bcrypt + JWT)
 |- saved-recipes.js                     -> saved_recipes table
 |- search-history.js                    -> search_history table
 |- donations.js, impact.js              -> donations table (+ aggregates)
 \- search-recipes.js, recipe-info.js,   -> proxy to Spoonacular
    random-recipe.js                        (key stays server-side)
   |
   v
MySQL database
```

## 1. Get a Spoonacular API key

1. Go to https://spoonacular.com/food-api and create a free account.
2. Copy your API key (the free tier gives ~150 requests/day — plenty for a demo).

## 2. Get a MySQL database

Any MySQL-compatible host works. Two easy, free options:

- **PlanetScale** (https://planetscale.com) — generous free tier, MySQL-compatible,
  built for serverless apps like this one. Create a database, then grab a
  connection string from **Connect → Node.js**.
- **Railway** or **Aiven** also offer free/low-cost managed MySQL.
- For local development you can also point this at MySQL running via
  XAMPP/phpMyAdmin — just set `DB_SSL=false` in that case.

Once you have a database, create the tables with the included script rather
than hunting for a web SQL console (several free providers, Aiven included,
don't ship one):

```bash
npm install
cp .env.example .env     # then fill in your real DB_* values in .env
npm run db:init
```

This connects with the same `mysql2` library the app itself uses and creates
four tables: `users`, `saved_recipes`, `search_history`, `donations`. You
should see each table print "done", then a final `SHOW TABLES` listing all
four.

If you'd rather use a GUI, `schema.sql` still has the raw SQL — any MySQL
client (TablePlus, Beekeeper Studio, MySQL Workbench, `mysql` CLI) can run it
too, just paste the statements in one at a time rather than all at once.

## 3. Deploy to Netlify

**Via Git (recommended, since there's now a build/install step):**

1. Push this folder to a GitHub repo.
2. In Netlify: **Add new site → Import an existing project**, pick the repo.
   `netlify.toml` already sets `publish = public` and `functions = netlify/functions`
   — Netlify will run `npm install` automatically for the backend dependencies.
3. Go to **Site settings → Environment variables** and add:

   | Key                   | Value                                                          |
   |------------------------|-----------------------------------------------------------------|
   | `SPOONACULAR_API_KEY`  | your Spoonacular key                                           |
   | `DB_HOST`              | your MySQL host                                                 |
   | `DB_PORT`              | usually `3306`                                                  |
   | `DB_USER`              | your MySQL username                                             |
   | `DB_PASSWORD`          | your MySQL password                                             |
   | `DB_NAME`              | your database name                                              |
   | `DB_SSL`               | `true` for PlanetScale/Railway/Aiven, `false` for local MySQL   |
   | `JWT_SECRET`           | any long random string (e.g. from `openssl rand -hex 32`)      |

4. Trigger a deploy.

**Drag-and-drop is no longer enough on its own** — it works for the static
files, but Netlify needs the Git-based build to run `npm install` for
`mysql2`, `bcryptjs`, and `jsonwebtoken`. If you'd rather not use Git, you can
still use the Netlify CLI:

```bash
npm install -g netlify-cli
cd pantrypal-fogmen
npm install
netlify deploy --prod
```

## 4. Try it

Open the deployed URL, create an account (this writes a row to `users`),
add a few ingredients (try `rice, chicken, tomato, onion`), and hit
**Find recipes**. Save a couple, then check the **Impact** tab — the numbers
come from a live SQL query, not local storage.

## Project structure

```
pantrypal-fogmen/
├── package.json              # backend deps: mysql2, bcryptjs, jsonwebtoken
├── schema.sql                 # raw SQL reference (for GUI clients)
├── scripts/init-db.js         # run this to create the schema: npm run db:init
├── .env.example                # template for local-only DB credentials
├── .gitignore                  # keeps .env and node_modules out of Git
├── netlify.toml               # build + redirect config
├── netlify/functions/
│   ├── lib/db.js               # MySQL connection helper
│   ├── lib/auth.js             # JWT + bcrypt helpers
│   ├── auth-signup.js / auth-login.js
│   ├── saved-recipes.js        # GET/POST/DELETE, JWT-protected
│   ├── search-history.js       # GET/POST, JWT-protected
│   ├── donations.js            # GET/POST, JWT-protected
│   ├── impact.js               # GET aggregate stats, JWT-protected
│   └── search-recipes.js, recipe-info.js, random-recipe.js  # Spoonacular proxy
└── public/                    # the static site Netlify serves
    ├── index.html
    ├── css/styles.css
    └── js/
        ├── api.js              # fetch wrappers, incl. JWT handling
        └── app.js              # app state, router, and all views
```

## Notes worth mentioning in your defense

- **Auth**: passwords are hashed with bcrypt before storage; sessions use
  signed JWTs (30-day expiry) sent as `Authorization: Bearer <token>` headers.
  The token's payload is decoded client-side only to display the user's name
  after a refresh — every actual read/write is re-verified server-side.
- **Why MySQL over the earlier localStorage version**: this now matches a
  standard three-tier architecture (client → API → relational database).
  Relationships (`saved_recipes.user_id → users.id`, etc.) are enforced at
  the application layer with indexed lookup columns rather than `FOREIGN KEY`
  constraints, since constraint support is inconsistent across free
  MySQL-compatible hosts (TiDB Serverless in particular). The impact page's
  numbers come from server-computed SQL aggregates, not client-side math.
- **Donations are still simulated** — no payment provider is connected, by
  design, to keep scope to what the project needs to demonstrate. Swapping
  in Paystack or Flutterwave would slot into `donations.js` and the
  `renderSupport()` flow in `app.js` without touching the rest of the app.
- **Impact numbers are estimates**, not measured food-waste data, and the
  UI says so explicitly.

## Natural next steps

- Add refresh tokens / logout-everywhere support.
- Add a real payment provider on the Support page.
- Add an admin view of aggregate (anonymized) impact across all users.
- Add push notifications for saved-recipe reminders.
