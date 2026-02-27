# Minimal Postgres for GoTrue Authentication
# ==========================================
# A simple Postgres Alpine image with the minimal extensions
# and configuration that GoTrue needs.

FROM postgres:16-alpine
COPY init.sql /docker-entrypoint-initdb.d/
