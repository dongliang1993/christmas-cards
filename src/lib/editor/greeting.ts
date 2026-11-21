/**
 * The greeting's name and the envelope's recipient fill each other in
 * (mobile editor spec §6.4) until the sender types the other one by hand.
 */

/** The words between "Dear" and the closing comma; "" when there are none. */
export function nameFromGreeting(greeting: string): string {
  const m = /^\s*dear\s+([\s\S]*?)[\s,，、!！]*$/i.exec(greeting);
  return m ? m[1].trim() : "";
}

export function greetingFor(name: string): string {
  return `Dear ${name.trim()},`;
}

/** Which side is still following the other (true = filled in automatically). */
export interface GreetingLinks {
  recipient: boolean;
  greeting: boolean;
}

/** On load, a side that still matches what the other would give keeps following. */
export function linksFor(greeting: string, recipientName: string, greetingIsBlank: boolean): GreetingLinks {
  const name = recipientName.trim();
  return {
    recipient: name === "" || name === nameFromGreeting(greeting),
    greeting: greetingIsBlank || (name !== "" && greeting === greetingFor(name)),
  };
}
