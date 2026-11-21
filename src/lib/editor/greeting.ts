/** The recipient is the name the sender writes after "Dear" (mobile editor spec §6.4). */

/** The words between "Dear" and the closing comma; "" when there are none. */
export function nameFromGreeting(greeting: string): string {
  const m = /^\s*dear\s+([\s\S]*?)[\s,，、!！]*$/i.exec(greeting);
  return m ? m[1].trim() : "";
}

export function greetingFor(name: string): string {
  return `Dear ${name.trim()},`;
}
