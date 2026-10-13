/**
 * The public record of collaborations with a transfer of value (docs/05 §4.8): date (UTC),
 * the person or account, what was given, the post. Add a line before the post goes out.
 */
export const COLLABS: readonly {
  date: string;
  who: string;
  value: string;
  post: string | null;
}[] = [];
