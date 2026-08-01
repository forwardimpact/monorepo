#!/usr/bin/env bash
set -e

# Install dependencies
bun install

# Generate types, services, clients from proto/
just codegen

# Set up environment (copy examples, generate secrets, storage credentials)
just env-setup

# Create data directories
just data-init

# Point EMBEDDING_BASE_URL at the TEI sidecar instead of localhost
sed -i 's|EMBEDDING_BASE_URL=http://localhost:8090|EMBEDDING_BASE_URL=http://tei:8090|' .env

# Remove tei and supabase from rc services. TEI runs as a Docker sidecar.
# The minimal devcontainer workflows do not need Supabase.
bun -e "
import { readFileSync, writeFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('config/config.json', 'utf8'));
c.init.services = c.init.services.filter(s => s.name !== 'tei' && s.name !== 'supabase');
writeFileSync('config/config.json', JSON.stringify(c, null, 2) + '\n');
"
