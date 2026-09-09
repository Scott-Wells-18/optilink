# OptiLink Reports

An electrical inspection reporting dashboard. Thermographic surveys, RCD test
results, before-and-after photos and site observations go in; a branded,
plain-English report that a client can actually understand comes out.

Built for Australian work — findings are assessed against **AS/NZS 3000** and
**AS/NZS 3017**.

---

## What it does

**A password on the front door.** One shared office password, set as an
environment variable. Everything behind it is private.

**Reports that save themselves.** Every field writes to the database as you
type. Close the laptop halfway through a job and pick it up on the next one —
nothing is lost, and there is no Save button to forget.

**Thermographic survey.** Drop the images straight off the camera and OptiLink
creates an entry for each one. Enter the measured temperature and a reference
and it works out the temperature rise (ΔT), grades the severity, and writes the
explanation the client reads.

**RCD testing to AS/NZS 3017.** Enter trip times off the tester. Pass and fail
are decided against the maximum disconnection times in the standard, including
the 5 × I∆n test, the ramp test and the operating button. A failure is explained
in a sentence a homeowner understands.

**Visual observations.** Anything else you noticed, with a priority and a
timeframe attached.

**Before and after.** Paired photos that print side by side with your caption.

**A summary written for you.** OptiLink drafts the executive summary and the
recommendations from your findings, then gets out of the way — edit the wording
and your version is kept.

**A report the client can read.** Priority actions first, a traffic-light key
explaining what each rating means, plain-English notes against every finding,
and a glossary that only includes the terms this particular report uses.
Print it or save it as a PDF straight from the browser.

---

## Deploying to Railway

1. **Create the project.** In Railway, choose *New Project → Deploy from GitHub
   repo* and pick this repository. Railway detects Next.js and builds it.

2. **Add a Postgres database.** *New → Database → Add PostgreSQL*, in the same
   project.

3. **Add a Volume for the photos.** Select the app service, then *Settings →
   Volumes → Add Volume*, and mount it at `/data`. Without this, uploaded
   images are lost on every redeploy.

4. **Set the environment variables** on the app service (*Variables*):

   | Variable | Value |
   | --- | --- |
   | `APP_PASSWORD` | The password the office types on the front page. |
   | `SESSION_SECRET` | A long random string. Generate one with `openssl rand -base64 48`. |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — Railway fills this in when you reference the database. |
   | `UPLOAD_DIR` | `/data/uploads` |
   | `SESSION_HOURS` | *(optional)* How long a login lasts. Defaults to 72. |

5. **Deploy.** The start command runs `prisma migrate deploy` before the server
   starts, so the database tables are created on the first boot. Railway's
   health check watches `/api/health`.

6. **Generate a domain.** *Settings → Networking → Generate Domain*, then open
   it and sign in with `APP_PASSWORD`.

### Changing the password later

Update `APP_PASSWORD` in Railway's *Variables* and redeploy. Existing sessions
stay valid until they expire — to sign everyone out immediately, change
`SESSION_SECRET` as well.

---

## Running it locally

```bash
npm install
cp .env.example .env          # then fill in the values
npx prisma migrate dev        # creates the tables
npm run dev                   # http://localhost:3000
```

You need a Postgres database running locally, and `DATABASE_URL` pointing at it.

---

## Where things live

```
prisma/schema.prisma          The data model
src/lib/standards/rcd.ts      AS/NZS 3017 trip-time limits and pass/fail logic
src/lib/standards/thermal.ts  ΔT severity bands and the plain-English wording
src/lib/report.ts             Priority actions, overall risk, drafted summaries
src/lib/glossary.ts           Plain-English definitions used in reports
src/app/(dashboard)/          The dashboard, editor, clients and settings
src/app/(dashboard)/reports/[id]/preview/   The printed client report
src/app/api/                  The JSON endpoints the editor saves to
```

## A note on the standards

AS/NZS 3017 sets the RCD disconnection times used here, and they are listed in
**Settings → How OptiLink grades findings** so they can be checked against the
current edition.

Neither AS/NZS 3000 nor AS/NZS 3017 publishes temperature-rise bands for
infrared surveys, so OptiLink uses the industry convention (NETA MTS Table
100.18), splitting the top band so an urgent fire risk reads differently from
"book it in this week". Every severity and every pass/fail can be overridden by
the technician — the app assists the judgement, it does not replace it.
