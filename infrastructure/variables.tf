variable "project_id" {
  description = "The GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "us-east1"
}

variable "db_password" {
  description = "PostgreSQL database password (store in Secret Manager in production)"
  type        = string
  sensitive   = true
}

variable "mvp_api_key" {
  description = "Random API key for MVP auth middleware"
  type        = string
  sensitive   = true
}

variable "video_processor_service_url" {
  description = "Cloud Run Service URL for the video processor (used as Pub/Sub push endpoint)"
  type        = string
  default     = "https://clipora-video-processor-594534640965.us-east1.run.app/"
}
