import { registerHooks } from "node:module";
import { resolve } from "./runtime-loader.mjs";

// Synchronous hooks also cover createRequire(...).resolve in native preparation.
registerHooks({ resolve });
