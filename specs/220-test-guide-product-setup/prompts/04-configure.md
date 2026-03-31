# Step 4: Configure the framework data

Using the packages you installed in the previous step, set up the engineering
framework data that Guide needs to operate.

Working in the current directory:

1. Initialize framework data:
   - Run `bunx fit-pathway init` to create example data
   - If that doesn't work, check `bunx fit-pathway --help` for the right command
2. Explore the generated data:
   - List what's in the ./data/ directory
   - Run `bunx fit-pathway discipline --list` to see available disciplines
   - Run `bunx fit-pathway level --list` to see available levels
   - Run `bunx fit-pathway track --list` to see available tracks
3. Validate the data:
   - Run `bunx fit-map validate` to check data integrity
   - Run `bunx fit-map validate --data=./data` if the default path doesn't work
4. Generate a job definition to verify everything works:
   - Run `bunx fit-pathway job --list` to see valid combinations
   - Run `bunx fit-pathway job <discipline> <level>` with one valid combination
5. Generate agent profiles:
   - Run `bunx fit-pathway agent --list` to see valid combinations
   - Run `bunx fit-pathway agent <discipline> --track=<track> --output=./agents`

Write a detailed log to ./notes/04-configure.md covering:
- Each command you ran and its output (summarized)
- Whether the data was generated correctly
- Whether validation passed
- The structure of generated agent profiles
- Any issues encountered
