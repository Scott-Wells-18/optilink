# tessdata

The English model the thermal-image reader uses, from `tessdata_fast`.

It is committed rather than fetched at runtime so a survey done on a poor
site connection does not stall waiting on a download, and so the app has no
dependency on a CDN staying up. `readTemperatures` points tesseract.js at
this directory through `langPath`.
