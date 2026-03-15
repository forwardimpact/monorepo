#!/usr/bin/env bash
set -e

# Install dependencies
npm install

# Generate types, services, clients from proto/
make codegen

# Set up environment (copy examples, generate secrets, storage credentials)
make env-setup

# Create data directories
make data-init

# Point EMBEDDING_BASE_URL at the TEI sidecar (not localhost)
sed -i 's|EMBEDDING_BASE_URL=http://localhost:8090|EMBEDDING_BASE_URL=http://tei:8090|' .env.local

# Remove tei and supabase from rc services — TEI runs as a Docker sidecar,
# Supabase is not needed for the minimal devcontainer workflows
node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('config/config.json', 'utf8'));
c.init.services = c.init.services.filter(s => s.name !== 'tei' && s.name !== 'supabase');
writeFileSync('config/config.json', JSON.stringify(c, null, 2) + '\n');
"
