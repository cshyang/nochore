import * as fs from "fs/promises";
import * as path from "path";

// ---------------------------------------------------------------------------
// WorkspaceIdentity — structured representation of agent identity files
// ---------------------------------------------------------------------------

export interface WorkspaceIdentity {
  knowledgeMd: string | null;
  agentMd: string | null;
  policyMd: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Directories the agent is allowed to write to. */
const WRITABLE_DIRS = ["scratchpad"];

// ---------------------------------------------------------------------------
// WorkspaceStore — controlled filesystem access for agent workspaces
// ---------------------------------------------------------------------------

export class WorkspaceStore {
  private readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = path.resolve(basePath);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Read any .md file in the workspace.
   * Returns null if the file does not exist.
   * Only allows .md files.
   */
  async readFile(relativePath: string): Promise<string | null> {
    this.validatePath(relativePath);
    this.assertMdExtension(relativePath);

    const fullPath = path.join(this.basePath, relativePath);
    try {
      return await fs.readFile(fullPath, "utf-8");
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  /**
   * Write files ONLY to scratchpad/ subdirectories.
   * Throws if the path targets any other location.
   * Creates parent directories as needed.
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    this.validatePath(relativePath);
    this.assertMdExtension(relativePath);
    this.assertWritable(relativePath);

    const fullPath = path.join(this.basePath, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
  }

  /**
   * List all .md files in the workspace (recursive).
   * Returns relative paths from the workspace root.
   */
  async listFiles(): Promise<string[]> {
    const results: string[] = [];
    await this.walkDir(this.basePath, results);
    return results.sort();
  }

  /**
   * Check whether a file exists in the workspace.
   */
  async exists(relativePath: string): Promise<boolean> {
    this.validatePath(relativePath);

    const fullPath = path.join(this.basePath, relativePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load the durable identity files kept in the simplified workspace.
   */
  async loadIdentity(): Promise<WorkspaceIdentity> {
    const knowledgeMd = await this.readFile("KNOWLEDGE.md");
    return {
      knowledgeMd,
      agentMd: null,
      policyMd: null,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Validate that a relative path is safe (no traversal, no absolute, no null bytes).
   */
  private validatePath(relativePath: string): void {
    if (relativePath.includes("\0") || relativePath.startsWith("/") || relativePath.includes("..")) {
      throw new Error(
        `Invalid path: "${relativePath}". Path must not contain "..", start with "/", or contain null bytes.`,
      );
    }
  }

  /**
   * Assert that the path targets a .md file.
   */
  private assertMdExtension(relativePath: string): void {
    if (!relativePath.endsWith(".md")) {
      throw new Error(`Only .md files are allowed. Got: "${relativePath}"`);
    }
  }

  /**
   * Assert that the path is within a writable directory.
   */
  private assertWritable(relativePath: string): void {
    const firstSegment = relativePath.split("/")[0];
    if (!WRITABLE_DIRS.includes(firstSegment)) {
      throw new Error(
        `Path "${relativePath}" is not writable. Only ${WRITABLE_DIRS.join(", ")}/ directories are writable.`,
      );
    }
  }

  /**
   * Recursively walk a directory, collecting .md file paths relative to basePath.
   */
  private async walkDir(dir: string, results: string[]): Promise<void> {
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // Directory doesn't exist — empty result
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walkDir(fullPath, results);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(path.relative(this.basePath, fullPath));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
