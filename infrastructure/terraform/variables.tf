variable "aws_region" {
  description = "AWS Region"
  type        = string
  default     = "ap-northeast-1"
}

variable "cognito_domain_prefix" {
  description = "Prefix for the Cognito Hosted UI domain"
  type        = string
  default     = "maildeck-auth" # Change this if taken
}

variable "cognito_callback_urls" {
  description = "List of allowed callback URLs for the identity provider"
  type        = list(string)
  default     = ["http://localhost:5173/"]
}

variable "cognito_logout_urls" {
  description = "List of allowed logout URLs for the identity provider"
  type        = list(string)
  default     = ["http://localhost:5173/"]
}


