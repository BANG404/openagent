import { describe, expect, test } from "bun:test";
import {
  createChatGroupMentionExtension,
  findChatGroupMentionStart,
  matchChatGroupMention,
} from "../src/lib/streamdown/chatGroupMention";

describe("chat group mention rendering", () => {
  test("marks persisted role mentions, including quoted names", () => {
    expect(
      createChatGroupMentionExtension([{ id: "reviewer-id", roleName: "reviewer" }]),
    ).toBeTruthy();
    expect(
      matchChatGroupMention("@reviewer", [
        { id: "reviewer-id", roleName: "reviewer" },
        { id: "designer-id", roleName: "UI Review" },
      ]),
    ).toEqual(
      expect.objectContaining({
        type: "chatGroupMention",
        label: "@reviewer",
        roleId: "reviewer-id",
      }),
    );
    expect(
      matchChatGroupMention('@"UI Review"', [
        { id: "reviewer-id", roleName: "reviewer" },
        { id: "designer-id", roleName: "UI Review" },
      ]),
    ).toEqual(
      expect.objectContaining({
        type: "chatGroupMention",
        label: "@UI Review",
        roleId: "designer-id",
      }),
    );
  });

  test("leaves email addresses, code, and unknown roles as ordinary text", () => {
    expect(findChatGroupMentionStart("mail foo@reviewer")).toBeUndefined();
    expect(findChatGroupMentionStart("`@reviewer`")).toBeUndefined();
    expect(
      matchChatGroupMention("@unknown", [{ id: "reviewer-id", roleName: "reviewer" }]),
    ).toBeUndefined();
  });
});
