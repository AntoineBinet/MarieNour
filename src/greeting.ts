// Helpers d'adresse à l'utilisateur — centralise « comment l'app te parle » pour
// que le surnom et le style d'accueil choisis dans Personnalisation s'appliquent
// partout de la même façon.
import type { PublicUser } from "@shared/types";

/** Le prénom/surnom par lequel l'app s'adresse à toi (sinon, le nom affiché). */
export function addressName(user: Pick<PublicUser, "display_name" | "prefs"> | null | undefined): string {
  const nick = user?.prefs?.nickname?.trim();
  if (nick) return nick;
  // À défaut, on prend le premier mot du nom affiché (plus chaleureux).
  const name = user?.display_name?.trim() || "";
  return name.split(/\s+/)[0] || name;
}

/** Salutation selon l'heure de la journée. */
export function timeSalutation(d = new Date()): string {
  const h = d.getHours();
  if (h < 6) return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bel après-midi";
  return "Bonne soirée";
}

export interface Greeting {
  text: string; // ligne d'accueil principale
  emoji: string | null; // petit emoji optionnel
}

/**
 * Construit le message d'accueil de la page d'accueil selon les préférences :
 * - "time" (défaut) : « Bonjour, Marie » (varie selon l'heure)
 * - "simple" : « Bonjour, Marie » (sans variation horaire)
 * - "custom" : message libre, avec {prenom} remplacé par le surnom
 * - "none" : juste le prénom
 */
export function buildGreeting(user: Pick<PublicUser, "display_name" | "prefs"> | null | undefined): Greeting {
  const name = addressName(user);
  const prefs = user?.prefs ?? {};
  const emoji = prefs.greeting_emoji?.trim() || null;
  const style = prefs.greeting_style ?? "time";

  if (style === "none") return { text: name, emoji };
  if (style === "simple") return { text: `Bonjour, ${name}`, emoji };
  if (style === "custom") {
    const raw = prefs.greeting_custom?.trim();
    if (raw) return { text: raw.replace(/\{prenom\}/gi, name), emoji };
    return { text: `${timeSalutation()}, ${name}`, emoji };
  }
  return { text: `${timeSalutation()}, ${name}`, emoji };
}
