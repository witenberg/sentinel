variable "name_prefix" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "security_group_id" {
  type = string
}

variable "instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "allocated_storage" {
  type    = number
  default = 20
}

variable "db_name" {
  type    = string
  default = "sentinel_db"
}

variable "db_username" {
  type    = string
  default = "sentinel"
}

variable "db_password" {
  type      = string
  sensitive = true
}
