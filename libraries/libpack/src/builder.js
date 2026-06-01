import { join } from "path";

/** Orchestrate pack generation across stager and emitters. */
export class PackBuilder {
  #stager;
  #emitters;
  #fs;

  /** @param {{stager: PackStager, emitters: {tar: TarEmitter, git: GitEmitter, disc: DiscEmitter}, runtime?: object}} deps */
  constructor({ stager, emitters, runtime }) {
    if (!runtime) throw new Error("runtime is required");
    const rt = runtime;
    this.#stager = stager;
    this.#emitters = emitters;
    this.#fs = rt.fs;
  }

  /** Build all packs from combinations into outputDir. */
  async build({ combinations, outputDir, version }) {
    const { mkdir, rm } = this.#fs;
    const stagingDir = join(outputDir, "_packs");
    const rawOutDir = join(outputDir, "packs", "raw");
    const apmOutDir = join(outputDir, "packs", "apm");
    const skillsOutDir = join(outputDir, "packs", "skills");
    await mkdir(stagingDir, { recursive: true });
    await mkdir(rawOutDir, { recursive: true });
    await mkdir(apmOutDir, { recursive: true });
    await mkdir(skillsOutDir, { recursive: true });

    const allPackEntries = [];

    for (const combo of combinations) {
      const fullDir = join(stagingDir, combo.name);
      const apmDir = join(stagingDir, `${combo.name}-apm`);
      const apmGitDir = join(stagingDir, `${combo.name}-apm-git`);

      await mkdir(fullDir, { recursive: true });
      await mkdir(apmDir, { recursive: true });
      await mkdir(apmGitDir, { recursive: true });

      await this.#stager.stageFull(fullDir, combo.content);
      await this.#stager.stageApm(fullDir, apmDir, combo.name, version);
      await this.#stager.stageApmGit(fullDir, apmGitDir, combo.name, version);

      await this.#emitters.tar.emit(
        fullDir,
        join(rawOutDir, `${combo.name}.tar.gz`),
      );
      await this.#emitters.tar.emit(
        apmDir,
        join(apmOutDir, `${combo.name}.tar.gz`),
      );
      await this.#emitters.git.emit(apmGitDir, join(apmOutDir, combo.name), {
        version,
        name: combo.name,
      });

      const skillsSrcDir = this.#stager.skillsDir(fullDir);
      const entries = await this.#emitters.disc.emit(
        skillsSrcDir,
        join(skillsOutDir, combo.name),
      );

      allPackEntries.push({ packName: combo.name, entries });
    }

    await this.#emitters.disc.emitAggregate(skillsOutDir, allPackEntries);
    await rm(stagingDir, { recursive: true, force: true });

    return {
      packs: combinations.map((c) => ({
        name: c.name,
        description: c.description,
      })),
    };
  }
}
