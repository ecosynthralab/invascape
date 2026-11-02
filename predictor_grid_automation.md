# Predictor grid: automatic refresh

A GitHub Actions workflow ([refresh-predictor-grid.yml](.github/workflows/refresh-predictor-grid.yml))
runs [tools/update_predictor_grid.py](tools/update_predictor_grid.py) every three months. It rebuilds
`predictor-grid.csv` from Earth Engine and commits it if it changed. Netlify then redeploys.
The script matches [gee_predictor_grid_export.js](gee_predictor_grid_export.js).

The script only replaces the file if the row count is within 10% of the current one and the distances
look plausible. Otherwise the job fails and the old grid stays.

## One-time setup

1. In Google Cloud (project `ecosynthralab`), create a service account, for example `invascape-grid`.
   No paid services are needed.
2. Create a JSON key for it.
3. Register the service account for Earth Engine (Earth Engine > Configuration > Project access, or
   grant it the roles **Earth Engine Resource Writer** and **Service Usage Consumer** on the project).
4. Share the `SE_Roads` asset with the service account email (reader access).
5. In GitHub: Settings > Secrets and variables > Actions > New repository secret.
   Name `EE_SERVICE_ACCOUNT_KEY`, value is the full contents of the JSON key file.
6. Run it once by hand: Actions > Refresh predictor grid > Run workflow. Check the result before
   relying on the schedule.

Never commit the JSON key to the repository.

## Notes

- Each state is exported to an Earth Engine asset (`predictor_grid_<State>`) and read back, so no Google
  Drive or Cloud Storage is involved.
- Roads and cropland change slowly, so every three months is plenty. Edit the `cron` line to change it.
