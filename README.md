# OptiLink

An internal dashboard for OptiLink Electrical & Communications.

## What is here now

**The front page.** The OptiLink logo, and one password field. Enter the
password and the logo travels up into the header while the sections rise in —
one continuous move, not a page load.

The password is one shared office password, set as an environment variable.
Until `APP_PASSWORD` is set it falls back to **`123`** and says so on screen.

**The hub.** Thermal, RCD, B&A and Clients sit centred on a white page. Press
one and the tree slides aside, then that section's branches draw in to the
right — across and downward from the card you pressed, never upward. The
sections themselves never move: branches take up width but no height, so
whatever is above and below stays exactly where it was. Everything off the
chosen path fades to grey. Press a card again to close it and step back.

**Clients** is real and saved to the database, three levels deep:

- **Clients** — every client you have added, then a grey **Add new** tile.
  Press it and a pop-up asks for the client name.
- **Sites** — open a client to see its sites, then **Add new** for site name
  and location.
- **Equipment** — open a site to see its equipment, then **Add new** for a name
  and a description. The description is deliberately hidden in the tree; click
  the equipment row to read it.

Added rows are solid; the **Add new** tile stays grey and sits at the bottom of
its list. Only one tile is ever on screen — the one belonging to the deepest
level you have open — so a long list does not carry a dead tile at every level
you have walked past. Step back out and the previous tile returns.

Hovering a row you added shows a small × to remove it — removing a client takes
its sites and equipment with it.

Thermal, RCD and B&A are still placeholders — three options, each with two,
each with one — waiting on the real steps.

## The logo

The OptiLink artwork lives at `public/brand/logo.jpg` and is used everywhere,
permanently, with nothing to set up.

To replace it — a transparent PNG or an SVG would be better than the JPEG —
drop a file into `public/brand/` named `logo.svg`, `logo.png` or `logo.webp`
and it takes precedence. On GitHub: open `public/brand/`, choose
**Add file → Upload files**, drag it in, commit; Railway redeploys on its own.

## Deploying to Railway

1. **Create the project** — *New Project → Deploy from GitHub repo*, pick this
   repository.
2. **Add Postgres** — *New → Database → Add PostgreSQL*, same project.
3. **Add a Volume** — on the app service, *Settings → Volumes → Add Volume*,
   mounted at `/data`.
4. **Set the variables** on the app service:

   | Variable | Value |
   | --- | --- |
   | `APP_PASSWORD` | The office password. Falls back to `123` if unset. |
   | `SESSION_SECRET` | A long random string — `openssl rand -base64 48`. |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `UPLOAD_DIR` | `/data/uploads` |

5. **Generate a domain** — *Settings → Networking → Generate Domain*.

`Environment variable not found: DATABASE_URL` on startup means step 2 or the
`DATABASE_URL` variable in step 4 is missing.

## Running it locally

```bash
npm install
cp .env.example .env          # fill in the values
npx prisma migrate dev        # create the tables
npm run dev                   # http://localhost:3000
```

## What is in the repo but not yet on screen

The electrical reporting engine is still here, with no interface in front of it
yet — the report editor and the printed client report were removed along with
the old second dashboard. Everything below is intact and ready to be wired into
the hub:

```
prisma/schema.prisma          Clients, sites, equipment, reports, findings, RCD tests
src/lib/standards/rcd.ts      AS/NZS 3017 trip-time limits and pass/fail logic
src/lib/standards/thermal.ts  ΔT severity bands and the plain-English wording
src/lib/report.ts             Priority actions, overall risk, drafted summaries
src/lib/glossary.ts           Plain-English definitions for client reports
src/app/api/                  JSON endpoints for all of the above
```

The removed screens are in git history at commit `613f639` if any of it is
worth bringing back.

## The interface itself

```
src/app/page.tsx              Sign-in + hub, as one screen
src/app/Gateway.tsx           The sign-in-to-hub transition
src/components/TreeNav.tsx    The branching navigation and its connectors
src/lib/navTree.ts            What sits under each section
src/lib/useSpringScroll.ts    Smooth scrolling
src/lib/useClientsTree.ts     Clients/sites/equipment, loaded and edited
src/components/AddDialog.tsx  The "add new" pop-up
src/components/InfoDialog.tsx The panel that reveals a description
```

## Standards note

RCD results are assessed against the maximum disconnection times in
**AS/NZS 3017**. Thermographic severity uses the industry ΔT bands (NETA MTS
Table 100.18), since AS/NZS 3000 and 3017 do not publish any. Both are worth
checking against the current editions before anything is issued to a client.
