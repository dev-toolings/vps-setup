import { parse, stringify } from "yaml";

/**
 * Parse YAML string to object
 */
export function parseYaml<T>(content: string): T | null {
  try {
    return parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Stringify object to YAML
 */
export function toYaml(data: unknown): string {
  // Emit YAML 1.1 so string scalars that collide with 1.1 boolean tokens
  // (yes/no/on/off/y/n/true/false) are quoted. Ansible parses with PyYAML
  // (YAML 1.1); an unquoted `yes` override would otherwise be read as the
  // boolean True and break templates like `PermitRootLogin {{ value }}`.
  return stringify(data, {
    version: "1.1",
    lineWidth: 0,
  });
}

/**
 * Parse JSON string to object
 */
export function parseJson<T>(content: string): T | null {
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Stringify object to JSON
 */
export function toJson(data: unknown, pretty = true): string {
  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}
