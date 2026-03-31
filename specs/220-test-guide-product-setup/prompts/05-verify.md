# Step 5: Start services and verify Guide is working

Working inside the ./monorepo directory, start the Guide service stack and
verify the end-to-end setup.

1. Start the services:
   - Run `make rc-start` to start all services
   - Run `make rc-status` to check that services are running
   - Note: TEI and Supabase services are auto-skipped if not installed — this is
     expected for a minimal local setup

2. Verify the knowledge pipeline:
   - Run `make cli-subjects` to list graph entities
   - Run `make cli-search ARGS="engineering skills"` to test vector search
   - If vector search fails (TEI not installed), that's expected — note it

3. Test the conversational agent:
   - Run `echo "What products does Forward Impact offer?" | make cli-chat`
   - If the agent responds, Guide is working end-to-end
   - If it fails, check `make rc-status` and report which services are down

4. Write a final status report to ./notes/05-verification-report.md covering:
   - Which services started successfully
   - Which services were skipped and why
   - Whether the knowledge pipeline is functional
   - Whether the agent responded to a test query
   - Any issues encountered and suggested fixes
