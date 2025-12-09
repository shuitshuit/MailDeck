resource "aws_kms_key" "maildeck_config_key" {
  description             = "KMS key for MailDeck server configuration encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true
}

resource "aws_kms_alias" "maildeck_config_alias" {
  name          = "alias/maildeck/config-encryption"
  target_key_id = aws_kms_key.maildeck_config_key.key_id
}

output "kms_key_id" {
  value = aws_kms_key.maildeck_config_key.key_id
}

output "kms_key_arn" {
  value = aws_kms_key.maildeck_config_key.arn
}
