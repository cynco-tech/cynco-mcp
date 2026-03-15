import { typeid } from "typeid-js";

export function generateId(prefix: string): string {
  return typeid(prefix).toString();
}
