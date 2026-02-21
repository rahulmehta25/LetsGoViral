terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ─────────────────────────────────────────
# APIs to Enable
# ─────────────────────────────────────────
locals {
  gcp_services = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "pubsub.googleapis.com",
    "storage.googleapis.com",
    "videointelligence.googleapis.com",
    "speech.googleapis.com",
    "aiplatform.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "vpcaccess.googleapis.com",
    "cloudcdn.googleapis.com",
    "compute.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.gcp_services)
  project            = var.project_id
  service            = each.key
  disable_on_destroy = false
}

# ─────────────────────────────────────────
# Service Account
# ─────────────────────────────────────────
resource "google_service_account" "clipora_sa" {
  account_id   = "clipora-service-account"
  display_name = "Clipora Service Account"
  project      = var.project_id
}

locals {
  sa_roles = [
    "roles/run.invoker",
    "roles/pubsub.publisher",
    "roles/pubsub.subscriber",
    "roles/storage.objectAdmin",
    "roles/cloudsql.client",
    "roles/aiplatform.user",
    "roles/videointelligence.user",
    "roles/cloudspeech.user",
    "roles/secretmanager.secretAccessor",
  ]
}

resource "google_project_iam_member" "sa_roles" {
  for_each = toset(local.sa_roles)
  project  = var.project_id
  role     = each.key
  member   = "serviceAccount:${google_service_account.clipora_sa.email}"
}

# ─────────────────────────────────────────
# Cloud Storage Buckets
# ─────────────────────────────────────────
resource "google_storage_bucket" "uploads" {
  name                        = "${var.project_id}-uploads"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  force_destroy               = false

  lifecycle_rule {
    action { type = "Delete" }
    condition { age = 30 } # auto-delete raw uploads after 30 days
  }
}

resource "google_storage_bucket" "processed" {
  name                        = "${var.project_id}-processed"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  force_destroy               = false

  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type", "Content-Length"]
    max_age_seconds = 3600
  }
}

# Grant SA object admin on both buckets
resource "google_storage_bucket_iam_member" "uploads_sa" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.clipora_sa.email}"
}

resource "google_storage_bucket_iam_member" "processed_sa" {
  bucket = google_storage_bucket.processed.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.clipora_sa.email}"
}

# Allow public read on processed clips (CDN serves them)
resource "google_storage_bucket_iam_member" "processed_public" {
  bucket = google_storage_bucket.processed.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# ─────────────────────────────────────────
# Pub/Sub
# ─────────────────────────────────────────
resource "google_pubsub_topic" "video_processing" {
  name    = "video-processing-topic"
  project = var.project_id
}

resource "google_pubsub_subscription" "video_processing_sub" {
  name    = "video-processing-subscription"
  topic   = google_pubsub_topic.video_processing.name
  project = var.project_id

  ack_deadline_seconds       = 600
  message_retention_duration = "3600s"

  push_config {
    push_endpoint = var.video_processor_service_url

    oidc_token {
      service_account_email = google_service_account.clipora_sa.email
    }
  }

  retry_policy {
    minimum_backoff = "30s"
    maximum_backoff = "300s"
  }
}

# Cloud Storage notification → Pub/Sub on upload finalize
resource "google_storage_notification" "upload_trigger" {
  bucket         = google_storage_bucket.uploads.name
  payload_format = "JSON_API_V1"
  topic          = google_pubsub_topic.video_processing.id
  event_types    = ["OBJECT_FINALIZE"]

  depends_on = [google_pubsub_topic.video_processing]
}

resource "google_pubsub_topic_iam_member" "storage_publisher" {
  topic  = google_pubsub_topic.video_processing.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:service-${data.google_project.project.number}@gs-project-accounts.iam.gserviceaccount.com"
}

data "google_project" "project" {
  project_id = var.project_id
}

# ─────────────────────────────────────────
# VPC & Serverless Connector
# ─────────────────────────────────────────
resource "google_vpc_access_connector" "connector" {
  name          = "clipora-vpc-connector"
  region        = var.region
  project       = var.project_id
  network       = "default"
  ip_cidr_range = "10.8.0.0/28"
  min_throughput = 200
  max_throughput = 300
}

# ─────────────────────────────────────────
# Cloud SQL (PostgreSQL 15)
# ─────────────────────────────────────────
resource "google_sql_database_instance" "clipora_db" {
  name             = "clipora-db"
  database_version = "POSTGRES_15"
  region           = var.region
  project          = var.project_id

  deletion_protection = true

  settings {
    tier              = "db-custom-1-3840"
    availability_type = "ZONAL"
    disk_size         = 20
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false # private IP only — no public IP
      private_network = "projects/${var.project_id}/global/networks/default"
    }

    backup_configuration {
      enabled    = true
      start_time = "03:00"
    }

    database_flags {
      name  = "max_connections"
      value = "100"
    }
  }
}

resource "google_sql_database" "creator_mvp" {
  name     = "creator_mvp"
  instance = google_sql_database_instance.clipora_db.name
  project  = var.project_id
}

resource "google_sql_user" "clipora_user" {
  name     = "clipora"
  instance = google_sql_database_instance.clipora_db.name
  password = var.db_password
  project  = var.project_id
}

# ─────────────────────────────────────────
# Secret Manager
# ─────────────────────────────────────────
resource "google_secret_manager_secret" "db_password" {
  secret_id = "clipora-db-password"
  project   = var.project_id
  replication { auto {} }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = var.db_password
}

resource "google_secret_manager_secret" "api_key" {
  secret_id = "clipora-api-key"
  project   = var.project_id
  replication { auto {} }
}

resource "google_secret_manager_secret_version" "api_key" {
  secret      = google_secret_manager_secret.api_key.id
  secret_data = var.mvp_api_key
}

# ─────────────────────────────────────────
# Artifact Registry
# ─────────────────────────────────────────
resource "google_artifact_registry_repository" "clipora_repo" {
  location      = var.region
  repository_id = "clipora"
  format        = "DOCKER"
  project       = var.project_id
}

# ─────────────────────────────────────────
# Cloud CDN (backed by processed bucket)
# ─────────────────────────────────────────
resource "google_compute_backend_bucket" "cdn_backend" {
  name        = "clipora-cdn-backend"
  bucket_name = google_storage_bucket.processed.name
  enable_cdn  = true
  project     = var.project_id

  cdn_policy {
    cache_mode        = "CACHE_ALL_STATIC"
    default_ttl       = 86400
    max_ttl           = 604800
    negative_caching  = true
  }
}

resource "google_compute_url_map" "cdn_url_map" {
  name            = "clipora-cdn-url-map"
  default_service = google_compute_backend_bucket.cdn_backend.id
  project         = var.project_id
}

resource "google_compute_target_https_proxy" "cdn_proxy" {
  name             = "clipora-cdn-proxy"
  url_map          = google_compute_url_map.cdn_url_map.id
  ssl_certificates = []
  project          = var.project_id
}
