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
