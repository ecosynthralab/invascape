# Predictor grid: automatic refresh

A GitHub Actions workflow ([refresh-predictor-grid.yml](.github/workflows/refresh-predictor-grid.yml))
runs [tools/update_predictor_grid.py](tools/update_predictor_grid.py) every three months. It rebuilds
`predictor-grid.csv` from Earth Engine and commits it if it changed. Netlify then redeploys.
The script matches [gee_predictor_grid_export.js](gee_predictor_grid_export.js).

The script only replaces the file if the row count is within 10% of the current one and the distances
look plausible. Otherwise the job fails and the old grid stays.

## Authentication: workload identity federation (no key file)

GitHub proves its identity to Google for each run, so no service account key is ever created or stored.

One-time setup in Google Cloud (project `ecosynthralab`), replacing `OWNER/REPO` with the GitHub
repository (`ecosynthralab/invascape`) and `PROJECT_NUMBER` with the project number:

1. Create a service account, for example `invascape-grid`, and give it the roles
   **Earth Engine Resource Writer** and **Service Usage Consumer**. Register it for Earth Engine
   if your project requires that, and share the `SE_Roads` asset with it (reader).
2. Create a workload identity pool and a GitHub provider:

   ```
   gcloud iam workload-identity-pools create github --project=ecosynthralab --location=global
   gcloud iam workload-identity-pools providers create-oidc github-provider --project=ecosynthralab --location=global --workload-identity-pool=github --issuer-uri="https://token.actions.githubusercontent.com" --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" --attribute-condition="assertion.repository=='OWNER/REPO'"
   ```

3. Allow that repository to act as the service account:

   ```
   gcloud iam service-accounts add-iam-policy-binding invascape-grid@ecosynthralab.iam.gserviceaccount.com --project=ecosynthralab --role=roles/iam.workloadIdentityUser --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/OWNER/REPO"
   ```

4. In GitHub: Settings > Secrets and variables > Actions > **Variables** tab, add two repository variables
   (these are not secrets):
   - `GCP_WORKLOAD_IDENTITY_PROVIDER` = `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github-provider`
   - `GCP_SERVICE_ACCOUNT` = `invascape-grid@ecosynthralab.iam.gserviceaccount.com`
5. Run it once by hand: Actions > Refresh predictor grid > Run workflow. Check the result before
   relying on the schedule.

The attribute condition limits access to this one repository, so other repositories cannot use the
identity.

## Notes

- Each state is exported to an Earth Engine asset (`predictor_grid_<State>`) and read back, so no Google
  Drive or Cloud Storage is involved.
- Roads and cropland change slowly, so every three months is plenty. Edit the `cron` line to change it.
