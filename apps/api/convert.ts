/**
 * convert.ts  –  Custom Postman-collection → OpenAPI 3.0 YAML generator
 *
 * No third-party converter library is used.  Only the built-in `fs` module
 * and a tiny YAML serialiser written here are required.
 * Usage:  node convert.js  (after build)  or  tsx convert.ts
 */

import "dotenv/config";
import fs from "fs";
import path from "path";

// ─── tiny YAML emitter ────────────────────────────────────────────────────────

function yamlStr(s: unknown): string {
  if (s === null || s === undefined) return "null";
  const str = String(s);
  if (str === "") return '""';
  if (
    /[:#{}\[\],&*?|<>=!%@`]/.test(str[0]) ||
    /[\n\r"]/.test(str) ||
    str.includes(": ") ||
    str.includes(" #") ||
    str === "true" ||
    str === "false" ||
    str === "null" ||
    /^\d/.test(str)
  ) {
    return (
      '"' +
      str
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r") +
      '"'
    );
  }
  return str;
}

function emitYaml(obj: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (obj === null || obj === undefined) return "null\n";
  if (typeof obj === "boolean" || typeof obj === "number") return `${obj}\n`;
  if (typeof obj === "string") return `${yamlStr(obj)}\n`;
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]\n";
    return obj
      .map((v) => `${pad}- ${emitYaml(v, indent + 1).trimStart()}`)
      .join("");
  }
  // object
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) return `${pad}{}\n`;
  return keys
    .map((k) => {
      const val = record[k];
      const keyStr = `${pad}${yamlStr(k)}:`;
      if (val === null || val === undefined) return `${keyStr} null\n`;
      if (typeof val === "boolean" || typeof val === "number")
        return `${keyStr} ${val}\n`;
      if (typeof val === "string") return `${keyStr} ${yamlStr(val)}\n`;
      if (Array.isArray(val)) {
        if (val.length === 0) return `${keyStr} []\n`;
        return (
          `${keyStr}\n` +
          val
            .map(
              (v) =>
                `${"  ".repeat(indent + 1)}- ${emitYaml(v, indent + 2).trimStart()}`,
            )
            .join("")
        );
      }
      if (typeof val === "object" && Object.keys(val as object).length === 0) {
        return `${keyStr} {}\n`;
      }
      return `${keyStr}\n` + emitYaml(val, indent + 1);
    })
    .join("");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function stripJsComments(text: string): string {
  return text.replace(/(?<!:)\/\/[^\n]*/g, "");
}

interface OaParam {
  name: string;
  in: string;
  required: boolean;
  schema: { type: string };
  description?: string;
}

interface OaPathResult {
  path: string;
  params: OaParam[];
}

function toOaPath(rawPath: string[]): OaPathResult {
  const parts: string[] = [];
  const params: OaParam[] = [];
  for (let i = 0; i < rawPath.length; i++) {
    const s = rawPath[i];
    if (s === "") continue;
    if (s.startsWith(":")) {
      const name = s.slice(1);
      parts.push(`{${name}}`);
      params.push({
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
      });
    } else if (/^\d+$/.test(s) || /^[0-9a-fA-F-]{36}$/.test(s)) {
      let name = "id";
      const prev = rawPath[i - 1];
      if (prev && prev !== "" && !/^\d+$/.test(prev) && !prev.startsWith(":")) {
        name = prev.replace(/s$/i, "") + "Id";
      }
      parts.push(`{${name}}`);
      params.push({
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
      });
    } else {
      parts.push(s);
    }
  }
  return { path: "/" + parts.join("/"), params };
}

interface PostmanUrlQuery {
  key?: string;
  description?: string;
}

interface PostmanUrl {
  path?: string[];
  query?: PostmanUrlQuery[];
}

function extractQueryParams(url: PostmanUrl | undefined): OaParam[] {
  const params: OaParam[] = [];
  for (const q of url?.query ?? []) {
    if (!q.key) continue;
    params.push({
      name: q.key,
      in: "query",
      required: false,
      schema: { type: "string" },
      ...(q.description ? { description: String(q.description) } : {}),
    });
  }
  return params;
}

interface JsonSchema {
  type: string;
  nullable?: boolean;
  example?: unknown;
  items?: JsonSchema | Record<string, never>;
  properties?: Record<string, JsonSchema>;
}

function rawJsonToSchema(raw: string): JsonSchema | null {
  try {
    const cleaned = stripJsComments(raw).trim();
    if (!cleaned) return null;
    const obj = JSON.parse(cleaned) as unknown;
    return jsonValueToSchema(obj);
  } catch {
    return { type: "object" };
  }
}

function jsonValueToSchema(val: unknown): JsonSchema {
  if (val === null) return { type: "string", nullable: true };
  if (typeof val === "boolean") return { type: "boolean", example: val };
  if (typeof val === "number") return { type: "number", example: val };
  if (typeof val === "string") return { type: "string", example: val };
  if (Array.isArray(val)) {
    return {
      type: "array",
      items: val.length ? jsonValueToSchema(val[0]) : {},
    };
  }
  const props: Record<string, JsonSchema> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    props[k] = jsonValueToSchema(v);
  }
  return { type: "object", properties: props };
}

interface PostmanFormData {
  key?: string;
  type?: string;
  value?: string;
  disabled?: boolean;
}

interface PostmanBody {
  mode?: string;
  raw?: string;
  formdata?: PostmanFormData[];
  urlencoded?: PostmanFormData[];
}

interface RequestBody {
  required: boolean;
  content: Record<string, unknown>;
}

function buildRequestBody(body: PostmanBody | undefined): RequestBody | null {
  if (!body || body.mode === "none") return null;

  if (body.mode === "raw") {
    const schema = rawJsonToSchema(body.raw ?? "");
    if (!schema) return null;
    return { required: true, content: { "application/json": { schema } } };
  }

  if (body.mode === "formdata") {
    const props: Record<string, unknown> = {};
    const required: string[] = [];
    for (const fd of body.formdata ?? []) {
      if (!fd.key) continue;
      props[fd.key] =
        fd.type === "file"
          ? { type: "string", format: "binary" }
          : { type: "string", ...(fd.value ? { example: fd.value } : {}) };
      if (!fd.disabled) required.push(fd.key);
    }
    return {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            ...(Object.keys(props).length ? { properties: props } : {}),
            ...(required.length ? { required } : {}),
          },
        },
      },
    };
  }

  if (body.mode === "urlencoded") {
    const props: Record<string, unknown> = {};
    for (const fd of body.urlencoded ?? []) {
      if (!fd.key) continue;
      props[fd.key] = {
        type: "string",
        ...(fd.value ? { example: fd.value } : {}),
      };
    }
    return {
      required: true,
      content: {
        "application/x-www-form-urlencoded": {
          schema: {
            type: "object",
            ...(Object.keys(props).length ? { properties: props } : {}),
          },
        },
      },
    };
  }

  return null;
}

interface PostmanHeader {
  key?: string;
}

interface PostmanRequest {
  method?: string;
  url?: PostmanUrl;
  body?: PostmanBody;
  header?: PostmanHeader[];
}

interface PostmanItem {
  name: string;
  item?: PostmanItem[];
  request?: PostmanRequest;
}

const tagsMap = new Map<string, true>();
const tagGroupsMap: Record<string, string[]> = {};

function walkItems(
  items: PostmanItem[],
  paths: Record<string, Record<string, unknown>>,
  parentStack: string[] = [],
): void {
  for (const item of items) {
    if (item.item) {
      walkItems(item.item, paths, [...parentStack, item.name]);
      continue;
    }

    const req = item.request;
    if (!req) continue;

    const method = (req.method ?? "GET").toLowerCase();
    const url = req.url;
    const rawSegments = Array.isArray(url?.path) ? url!.path! : [];

    const { path: oaPath, params: pathParams } = toOaPath(rawSegments);
    const queryParams = extractQueryParams(url);
    const allParams = [...pathParams, ...queryParams];

    const operationTag = parentStack.length ? parentStack.join("/") : "default";
    const groupName = parentStack[0] ?? "default";

    if (!tagsMap.has(operationTag)) tagsMap.set(operationTag, true);

    if (!tagGroupsMap[groupName]) tagGroupsMap[groupName] = [];
    if (!tagGroupsMap[groupName].includes(operationTag)) {
      tagGroupsMap[groupName].push(operationTag);
    }

    const operation: Record<string, unknown> = {
      tags: [operationTag],
      summary: item.name,
      operationId: item.name.replace(/[^a-zA-Z0-9_]/g, "_"),
      ...(allParams.length ? { parameters: allParams } : {}),
    };

    const reqBody = buildRequestBody(req.body);
    if (reqBody) operation.requestBody = reqBody;

    operation.responses = {
      200: {
        description: "Successful response",
        content: { "application/json": { schema: { type: "object" } } },
      },
    };

    const hasAuth = (req.header ?? []).some((h) => h.key === "Authorization");
    if (hasAuth) operation.security = [{ bearerAuth: [] }];

    if (!paths[oaPath]) paths[oaPath] = {};
    paths[oaPath][method] = operation;
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

const [, , collectionArg, outputArg] = process.argv;
const collectionPath = path.resolve(
  collectionArg ?? "./phyto.postman_collection.json",
);
const outputPath = path.resolve(outputArg ?? "./openapi.yaml");

interface PostmanCollection {
  info?: { name?: string };
  variable?: Array<{ key?: string; value?: string; disabled?: boolean }>;
  item?: PostmanItem[];
}

const collection = JSON.parse(
  fs.readFileSync(collectionPath, "utf-8"),
) as PostmanCollection;

const paths: Record<string, Record<string, unknown>> = {};
walkItems(collection.item ?? [], paths);

let serverUrl = process.env.OPENAPI_SERVER;
if (!serverUrl && Array.isArray(collection.variable)) {
  const baseVar = collection.variable.find(
    (v) =>
      (v.key === "baseURL" || v.key === "baseUrl" || v.key === "url") &&
      !v.disabled,
  );
  if (baseVar?.value) serverUrl = baseVar.value;
}
serverUrl =
  serverUrl ??
  `http://localhost:${process.env.PORT ?? 3507}/${process.env.MAIN_ROUTE ?? "chikishaa/v1"}`;

const xTagGroups = Object.entries(tagGroupsMap).map(([name, tags]) => ({
  name,
  tags,
}));

const openapi = {
  openapi: "3.0.3",
  info: {
    title: collection.info?.name ?? "API",
    version: "1.0.0",
  },
  servers: [{ url: serverUrl, description: "Local" }],
  tags: [...tagsMap.keys()].map((name) => {
    const parts = name.split("/");
    const displayName = parts.length > 1 ? parts.slice(1).join(" / ") : null;
    return { name, ...(displayName ? { "x-displayName": displayName } : {}) };
  }),
  "x-tagGroups": xTagGroups,
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
  security: [{ bearerAuth: [] }],
  paths,
};

const yamlOutput =
  "# Generated by convert.ts – do not edit manually\n" + emitYaml(openapi);
fs.writeFileSync(outputPath, yamlOutput, "utf-8");
console.log(
  `openapi.yaml written  (${Object.keys(paths).length} paths, ${tagsMap.size} tags, ${xTagGroups.length} groups)`,
);
