import { basename, extname } from "node:path";

export const CATEGORIES = ["generated", "test", "source", "documentation", "configuration", "other"];
export const ROLES = ["instruction", "implementation", "definition", "documentation", "data", "unknown"];
export const ENCODINGS = ["utf-8", "utf-16le", "utf-16be"];

const LANGUAGE_BY_EXTENSION = new Map([
  [".java", "java"], [".js", "javascript"], [".mjs", "javascript"], [".cjs", "javascript"], [".jsx", "javascript"],
  [".ts", "typescript"], [".mts", "typescript"], [".cts", "typescript"], [".tsx", "typescript"],
  [".py", "python"], [".sh", "shell"], [".bash", "shell"], [".zsh", "shell"],
  [".txt", "text"], [".html", "html"], [".htm", "html"], [".json", "json"], [".jsonl", "jsonl"], [".ndjson", "jsonl"],
  [".md", "markdown"], [".markdown", "markdown"], [".yml", "yaml"], [".yaml", "yaml"],
]);

const LANGUAGE_BY_BASENAME = new Map([
  [".bashrc", { language: "shell", dialect: "bash" }], [".bash_profile", { language: "shell", dialect: "bash" }],
  [".zshrc", { language: "shell", dialect: "zsh" }], [".zprofile", { language: "shell", dialect: "zsh" }],
]);

const LANGUAGE_BY_SHEBANG = new Map([
  ["sh", { language: "shell", dialect: "sh" }], ["bash", { language: "shell", dialect: "bash" }], ["zsh", { language: "shell", dialect: "zsh" }],
  ["python", { language: "python", dialect: null }], ["python3", { language: "python", dialect: null }],
  ["node", { language: "javascript", dialect: null }],
]);

const LANGUAGES = new Set([...LANGUAGE_BY_EXTENSION.values(), "unknown", "shell-sh", "shell-bash", "shell-zsh"]);

export function extensionOf(path) {
  const name = basename(path);
  const extension = extname(name);
  return extension === name ? "" : extension;
}

export function compileGlob(pattern) {
  if (typeof pattern !== "string" || pattern.length === 0 || pattern.startsWith("/") || pattern.includes("\\") || /[\[\]]/u.test(pattern)) {
    throw new Error(`Invalid glob pattern: ${String(pattern)}`);
  }
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        index += 1;
        if (pattern[index + 1] === "/") {
          index += 1;
          expression += "(?:[\\s\\S]*/)?";
        } else {
          expression += "[\\s\\S]*";
        }
      } else {
        expression += "[^/]*";
      }
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");
    }
  }
  return new RegExp(`${expression}$`, "u");
}

export function validateConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Config must be a JSON object");
  for (const key of Object.keys(config)) if (!["schema_version", "rules"].includes(key)) throw new Error(`Unknown config key: ${key}`);
  if (config.schema_version !== "miku-repo-scale.config/v1") throw new Error("Unsupported config schema_version");
  if (!Array.isArray(config.rules)) throw new Error("Config rules must be an array");
  const rules = config.rules.map((rule, index) => {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) throw new Error(`Config rule ${index} must be an object`);
    for (const key of Object.keys(rule)) if (!["match", "category", "role", "language", "encoding"].includes(key)) throw new Error(`Unknown config rule key: ${key}`);
    if (typeof rule.match !== "string") throw new Error(`Config rule ${index} requires a match glob`);
    const compiled = compileGlob(rule.match);
    if (rule.category !== undefined && !CATEGORIES.includes(rule.category)) throw new Error(`Unknown category: ${rule.category}`);
    if (rule.role !== undefined && !ROLES.includes(rule.role)) throw new Error(`Unknown role: ${rule.role}`);
    if (rule.language !== undefined && !LANGUAGES.has(rule.language)) throw new Error(`Unknown language: ${rule.language}`);
    if (rule.encoding !== undefined && !ENCODINGS.includes(rule.encoding)) throw new Error(`Unknown encoding: ${rule.encoding}`);
    return { ...rule, compiled, index };
  });
  return rules;
}

function firstExplicit(rules, path, key) {
  for (const rule of rules) if (rule[key] !== undefined && rule.compiled.test(path)) return { value: rule[key], reason: `config_rule_${rule.index + 1}` };
  return null;
}

function shebangFromText(text) {
  const firstLine = text.split(/[\r\n]/u, 1)[0];
  if (!firstLine.startsWith("#!")) return null;
  const parts = firstLine.slice(2).trim().split(/[\u0020\u0009]+/u).filter(Boolean);
  if (parts.length === 0) return { unsupported: true };
  let interpreter = basename(parts[0]);
  if (interpreter === "env") {
    if (parts.length !== 2 || parts[1].startsWith("-")) return { unsupported: true };
    interpreter = basename(parts[1]);
  } else if (parts.length !== 1) return { unsupported: true };
  const found = LANGUAGE_BY_SHEBANG.get(interpreter);
  return found ? { ...found, interpreter } : { unsupported: true };
}

function shellDialectFromExtension(extension) {
  if (extension === ".bash") return "bash";
  if (extension === ".zsh") return "zsh";
  return null;
}

export function classifyPath(path, rules = [], text = "") {
  const extension = extensionOf(path);
  const name = basename(path);
  const languageOverride = firstExplicit(rules, path, "language");
  const basenameLanguage = LANGUAGE_BY_BASENAME.get(name);
  const extensionLanguage = LANGUAGE_BY_EXTENSION.get(extension.toLowerCase());
  const shebang = shebangFromText(text);
  const declaredLanguage = languageOverride?.value.startsWith("shell-") ? "shell"
    : languageOverride?.value ?? basenameLanguage?.language ?? extensionLanguage ?? shebang?.language ?? "unknown";
  const configuredDialect = languageOverride?.value.startsWith("shell-") ? languageOverride.value.slice("shell-".length) : null;
  const pathDialect = basenameLanguage?.dialect ?? shellDialectFromExtension(extension.toLowerCase());
  const shebangIssue = shebang?.unsupported ? "SHEBANG_UNSUPPORTED"
    : shebang && shebang.language !== declaredLanguage ? "SHEBANG_LANGUAGE_MISMATCH"
      : shebang?.language === "shell" && (configuredDialect ?? pathDialect) && shebang.dialect !== (configuredDialect ?? pathDialect) ? "SHEBANG_DIALECT_MISMATCH" : null;
  const languageDialect = declaredLanguage === "shell"
    ? configuredDialect ?? (shebang?.language === "shell" && !shebang.unsupported ? shebang.dialect : null) ?? pathDialect ?? (extension.toLowerCase() === ".sh" ? "sh" : null)
    : null;
  const language = declaredLanguage;
  const languageReason = languageOverride?.reason ?? (basenameLanguage ? `basename:${name}`
    : extensionLanguage ? `extension:${extension.toLowerCase()}`
      : shebang && !shebang.unsupported ? `shebang:${shebang.interpreter}` : "unrecognized_extension");

  const roleOverride = firstExplicit(rules, path, "role");
  let role = roleOverride?.value;
  let roleReason = roleOverride?.reason;
  if (!role) {
    if (["AGENTS.md", "SKILL.md"].includes(name)) [role, roleReason] = ["instruction", `basename:${name}`];
    else if (/(^|\/)agents\/openai\.yaml$/u.test(path) || /^\.github\/workflows\/[^/]+\.(?:yml|yaml)$/u.test(path)) [role, roleReason] = ["definition", "known_definition_path"];
    else if (["java", "javascript", "typescript", "python", "shell"].includes(language)) [role, roleReason] = ["implementation", `language:${language}`];
    else if (["markdown"].includes(language) || /(^|\/)README(?:\.[^/]*)?$|(^|\/)LICENSE(?:\.[^/]*)?$/iu.test(path)) [role, roleReason] = ["documentation", "documentation_format_or_name"];
    else role = "unknown", roleReason = "insufficient_path_evidence";
  }

  const categoryOverride = firstExplicit(rules, path, "category");
  let category = categoryOverride?.value;
  let categoryReason = categoryOverride?.reason;
  if (!category) {
    if (/^(?:dist|build|target)\//u.test(path) || /\.min\.js$|\.map$/u.test(path)) [category, categoryReason] = ["generated", "generated_path_rule"];
    else if (/(^|\/)(?:test|tests|__tests__)(\/|$)/u.test(path) || /\.(?:test|spec)\.[^/]+$/u.test(path)) [category, categoryReason] = ["test", "test_path_rule"];
    else if (["instruction", "definition"].includes(role)) [category, categoryReason] = ["source", `role:${role}`];
    else if (/^docs\//u.test(path) || ["markdown"].includes(language) || /(^|\/)(?:README|LICENSE)(?:\.|$)/iu.test(path)) [category, categoryReason] = ["documentation", "documentation_path_or_format"];
    else if ([".json", ".yaml", ".yml", ".toml", ".ini", ".xml"].includes(extension.toLowerCase()) || [".gitignore", ".gitattributes", ".editorconfig"].includes(name)) [category, categoryReason] = ["configuration", "configuration_path_or_extension"];
    else if (role === "implementation") [category, categoryReason] = ["source", "implementation_role"];
    else [category, categoryReason] = ["other", "default"];
  }

  const encodingRule = firstExplicit(rules, path, "encoding");
  return {
    language, language_dialect: languageDialect, language_reason: languageReason,
    shebang_issue: shebangIssue,
    role, role_reason: roleReason,
    category, category_reason: categoryReason,
    encoding: encodingRule?.value ?? null,
    encoding_reason: encodingRule?.reason ?? null,
  };
}

export function matchesAny(path, patterns) {
  return patterns.some((pattern) => compileGlob(pattern).test(path));
}
