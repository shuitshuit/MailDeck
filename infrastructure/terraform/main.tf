terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_cognito_user_pool" "pool" {
  name = "maildeck-user-pool"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "MailDeck Verification Code"
    email_message        = "Your verification code is {####}"
  }

  web_authn_configuration {
    relying_party_id = "${var.cognito_domain_prefix}.auth.${var.aws_region}.amazoncognito.com"
    user_verification = "preferred"
  }

  sign_in_policy {
    allowed_first_auth_factors = ["PASSWORD", "WEB_AUTHN"]
  }

  schema {
    attribute_data_type = "String"
    developer_only_attribute = false
    mutable             = true
    name                = "email"
    required            = true

    string_attribute_constraints {
      min_length = 0
      max_length = 2048
    }
  }
}

resource "aws_cognito_user_pool_client" "client" {
  name = "maildeck-web-client"

  user_pool_id = aws_cognito_user_pool.pool.id

  # OAuth Configuration
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  callback_urls                        = var.cognito_callback_urls
  logout_urls                          = var.cognito_logout_urls

  explicit_auth_flows = [
    "ALLOW_USER_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_ADMIN_USER_PASSWORD_AUTH"
  ]
  
  supported_identity_providers = ["COGNITO"]

  # Prevent client secret generation (for web apps)
  generate_secret = false
}

resource "aws_cognito_user_pool_domain" "main" {
  domain               = var.cognito_domain_prefix
  user_pool_id         = aws_cognito_user_pool.pool.id
  managed_login_version = 2 # Enable Managed Login
}


