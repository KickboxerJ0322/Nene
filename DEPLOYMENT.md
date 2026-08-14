# GitHub and Cloud Run Setup

This project is prepared for `GitHub Actions -> Google Cloud Run` deployment.

## Target

- GitHub repository: `https://github.com/KickboxerJ0322/Nene.git`
- Google Cloud project: `jumpeicloud`
- Region: `asia-northeast1`
- Artifact Registry repository: `nene`
- Cloud Run service: `nene`

## Required GitHub Actions secrets

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

## Required Google Cloud setup

Enable:

- Cloud Run Admin API
- Artifact Registry API
- Cloud Build API
- IAM Credentials API
- Security Token Service API

Create Artifact Registry:

```bash
gcloud artifacts repositories create nene \
  --repository-format=docker \
  --location=asia-northeast1 \
  --description="Nene images"
```

Create deployer service account:

```bash
gcloud iam service-accounts create github-deployer \
  --display-name="GitHub Deployer"
```

Grant roles:

- `roles/run.admin`
- `roles/artifactregistry.writer`
- `roles/iam.serviceAccountUser`
- `roles/cloudbuild.builds.editor`

Store Gemini API key in Secret Manager:

```bash
printf "YOUR_GEMINI_API_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=-
```

Or add a new version:

```bash
printf "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
```

## First git push

```bash
git init
git branch -M main
git remote add origin https://github.com/KickboxerJ0322/Nene.git
git add .
git commit -m "Initial Nene app"
git push -u origin main
```

If `origin` already exists:

```bash
git remote set-url origin https://github.com/KickboxerJ0322/Nene.git
```
