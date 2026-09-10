# Brand assets

`optilink-mark.svg` is the ring from the OptiLink logo, drawn as SVG. The app
draws the full lockup itself (see `src/components/Logo.tsx`), so nothing here
has to exist for the logo to appear.

## Using the original artwork instead

Drop the real logo file into this folder named `logo.svg`, `logo.png`,
`logo.webp` or `logo.jpg` and the whole app picks it up automatically — sign-in
screen, header, sidebar and the cover of every report. Nothing else to change.

On GitHub you can do this in the browser: open this folder, choose
**Add file → Upload files**, drag the logo in, rename it to `logo.png`, and
commit. Railway redeploys on its own.

Uploading artwork under **Settings → Branding** in the app does the same thing
and takes precedence over a file dropped here.
