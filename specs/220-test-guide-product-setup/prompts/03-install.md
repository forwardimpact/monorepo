# Step 3: Install Guide in a fresh project

You are setting up the Forward Impact Guide product from scratch in a clean
project directory. Do NOT clone the monorepo — install packages from the npm
registry.

Working in the current directory:

1. Create a fresh package.json with `bun init -y`
2. Try to install the Guide product:
   - `bun install @forwardimpact/guide`
   - If that fails, try `bun install @forwardimpact/pathway @forwardimpact/map`
   - Check what packages are actually available on npm by the @forwardimpact org
3. Install whatever Forward Impact packages are available
4. Verify the installation:
   - Check that bin commands are available (try `bunx fit-pathway --help`,
     `bunx fit-map --help`, `bunx fit-guide --help`)
   - List what was installed in node_modules/@forwardimpact/
5. Based on what you found, assess:
   - Is Guide available as a standalone package?
   - What IS available and what can you do with it?
   - What would be needed to run Guide that isn't packaged?

Write a detailed log to ./notes/03-install.md covering each step, what worked,
what failed, and your assessment of the installation experience.
