import { formatGreeting } from "../../../packages/shared/src/format.js";

export function handleGreeting(name) {
  return { message: formatGreeting(name) };
}
