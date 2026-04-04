// Logical adapter layer: infrastructure-heavy implementations and current platform wiring.
// Repositories and workspace stay here until their contracts are separated from implementations.
export * from "../connections/index";
export * from "../db/client";
export * from "../db/schema";
export * from "../llm/model";
export * from "../persistence/index";
export * from "../repositories/index";
export * from "../workspace/index";
