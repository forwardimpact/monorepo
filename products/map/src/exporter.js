/**
 * Exporter — writes one HTML microdata file per base entity into
 * `<outputDir>/pathway/<type>/<id>.html`. The output directory is wiped at
 * the start of each run so stale entries do not survive YAML deletions.
 */

import { join } from "node:path";
import { aggregateTools, slugifyToolName } from "./view-builders/tool.js";

export class Exporter {
  #fs;
  #renderer;

  /**
   * @param {object} fs - Node fs/promises (or compatible) — must provide
   *   `mkdir`, `writeFile`, `rm`.
   * @param {import('./renderer.js').Renderer} renderer
   */
  constructor(fs, renderer) {
    if (!fs) throw new Error("fs is required");
    if (!renderer) throw new Error("renderer is required");
    this.#fs = fs;
    this.#renderer = renderer;
  }

  /**
   * Render every base entity in `data` into `<outputDir>/pathway/`.
   *
   * @param {object} args
   * @param {object} args.data - Data shape returned by DataLoader.loadAllData
   * @param {string} args.outputDir - Knowledge root (e.g. `data/knowledge`)
   * @returns {Promise<{ written: string[], errors: Array<{ path: string, error: string }> }>}
   */
  async exportAll({ data, outputDir }) {
    if (!data) throw new Error("data is required");
    if (!outputDir) throw new Error("outputDir is required");

    const root = join(outputDir, "pathway");
    await this.#fs.rm(root, { recursive: true, force: true });

    const ctx = this.#buildContext(data);
    const tasks = this.#buildTasks(data, ctx);
    return this.#runTasks(tasks, root);
  }

  #buildContext(data) {
    return {
      capabilities: data.capabilities || [],
      skills: data.skills || [],
      disciplines: data.disciplines || [],
      tracks: data.tracks || [],
      drivers: data.drivers || [],
      behaviours: data.behaviours || [],
    };
  }

  #buildTasks(data, ctx) {
    const r = this.#renderer;
    const tasks = [];
    const collect = (items, type, render) => {
      for (const item of items) {
        tasks.push({ type, id: item.id, render: () => render(item) });
      }
    };

    collect(ctx.skills, "skill", (s) => r.renderSkill(s, ctx));
    collect(ctx.capabilities, "capability", (c) => r.renderCapability(c, ctx));
    collect(data.levels || [], "level", (l) => r.renderLevel(l));
    collect(ctx.behaviours, "behaviour", (b) => r.renderBehaviour(b, ctx));
    collect(ctx.disciplines, "discipline", (d) => r.renderDiscipline(d));
    collect(ctx.tracks, "track", (t) => r.renderTrack(t));
    collect(ctx.drivers, "driver", (d) => r.renderDriver(d));

    (data.stages || []).forEach((stage, index) => {
      tasks.push({
        type: "stage",
        id: stage.id,
        render: () => r.renderStage(stage, index + 1),
      });
    });

    for (const tool of aggregateTools(ctx.skills)) {
      tasks.push({
        type: "tool",
        id: slugifyToolName(tool.name),
        render: () => r.renderTool(tool),
      });
    }

    return tasks;
  }

  async #runTasks(tasks, root) {
    const written = [];
    const errors = [];
    for (const task of tasks) {
      const dir = join(root, task.type);
      const path = join(dir, `${task.id}.html`);
      try {
        await this.#fs.mkdir(dir, { recursive: true });
        await this.#fs.writeFile(path, task.render(), "utf-8");
        written.push(path);
      } catch (error) {
        errors.push({ path, error: error.message });
      }
    }
    return { written, errors };
  }
}

/**
 * Factory wiring real fs (node:fs/promises) and a Renderer.
 * @param {object} [opts]
 * @param {object} [opts.fs] - Override filesystem (defaults to node:fs/promises)
 * @param {import('./renderer.js').Renderer} [opts.renderer]
 * @returns {Promise<Exporter>}
 */
export async function createExporter(opts = {}) {
  const fs = opts.fs || (await import("node:fs/promises"));
  let renderer = opts.renderer;
  if (!renderer) {
    const { createRenderer } = await import("./renderer.js");
    renderer = createRenderer();
  }
  return new Exporter(fs, renderer);
}
