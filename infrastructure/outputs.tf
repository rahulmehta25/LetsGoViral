output "uploads_bucket_name" {
  description = "Name of the raw video uploads bucket"
  value       = google_storage_bucket.uploads.name
}

output "processed_bucket_name" {
  description = "Name of the processed clips bucket"
  value       = google_storage_bucket.processed.name
}

output "pubsub_topic" {
  description = "Pub/Sub topic for video processing triggers"
  value       = google_pubsub_topic.video_processing.name
}

output "cloud_sql_instance_connection_name" {
  description = "Cloud SQL connection name for Cloud Run"
  value       = google_sql_database_instance.clipora_db.connection_name
}

output "cloud_sql_private_ip" {
  description = "Private IP of the Cloud SQL instance"
  value       = google_sql_database_instance.clipora_db.private_ip_address
  sensitive   = true
}

output "service_account_email" {
  description = "Service account email for Cloud Run services"
  value       = google_service_account.clipora_sa.email
}

output "artifact_registry_repo" {
  description = "Artifact Registry repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/clipora"
}

output "vpc_connector_name" {
  description = "Serverless VPC Access connector for Cloud SQL"
  value       = google_vpc_access_connector.connector.name
}
