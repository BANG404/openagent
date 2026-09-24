import type { Extension } from "svelte-streamdown";

export interface ChatGroupMentionToken {
  type: "chatGroupMention";
  raw: string;
  label: string;
  roleId: string;
}

export interface ChatGroupMentionRole {
  id: string;
  roleName: string;
}

const mentionPattern = /^@(?:"((?:[^"\\]|\\.)*)"|([\p{L}\p{N}_-]+))/u;

function decodeRoleName(value: string): string {
  return value.replaceAll('\\"', '"').trim();
}

function normalizeRoles(roles: readonly ChatGroupMentionRole[]) {
  return roles
    .map((role) => ({ ...role, roleName: role.roleName.trim() }))
    .filter((role) => role.roleName.length > 0)
    .sort((left, right) => right.roleName.length - left.roleName.length);
}

function tokenForSource(
  src: string,
  knownRoles: readonly ChatGroupMentionRole[],
): ChatGroupMentionToken | undefined {
  const match = src.match(mentionPattern);
  if (!match) return undefined;
  const roleName = decodeRoleName(match[1] ?? match[2] ?? "");
  const role = knownRoles.find(
    (candidate) => candidate.roleName.toLocaleLowerCase() === roleName.toLocaleLowerCase(),
  );
  if (!role) return undefined;
  return {
    type: "chatGroupMention",
    raw: match[0],
    label: `@${role.roleName}`,
    roleId: role.id,
  };
}

export function matchChatGroupMention(
  src: string,
  roles: readonly ChatGroupMentionRole[],
): ChatGroupMentionToken | undefined {
  return tokenForSource(src, normalizeRoles(roles));
}

export function findChatGroupMentionStart(src: string): number | undefined {
  for (let index = src.indexOf("@"); index >= 0; index = src.indexOf("@", index + 1)) {
    if (index === 0 || /\s/u.test(src[index - 1] ?? "")) return index;
  }
  return undefined;
}

/**
 * Marks only the persisted wake targets in a group message. The extension is
 * scoped to one message so ordinary @text and mentions in other messages keep
 * their original Markdown rendering.
 */
export function createChatGroupMentionExtension(
  roles: readonly ChatGroupMentionRole[],
): Extension | null {
  const knownRoles = normalizeRoles(roles);
  if (knownRoles.length === 0) return null;

  return {
    name: "chatGroupMention",
    level: "inline",
    start: findChatGroupMentionStart,
    tokenizer(src: string): ChatGroupMentionToken | undefined {
      return tokenForSource(src, knownRoles);
    },
  };
}
