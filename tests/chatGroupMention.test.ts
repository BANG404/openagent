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

  test("recognizes mentions after punctuation", () => {
    expect(findChatGroupMentionStart("请：@reviewer")).toBe(2);
    expect(findChatGroupMentionStart("然后、@reviewer")).toBe(3);
    expect(
      matchChatGroupMention("@严守-人类中心主义哲学家", [
        { id: "strict-humanist", roleName: "严守-人类中心主义哲学家" },
      ]),
    ).toEqual(
      expect.objectContaining({
        type: "chatGroupMention",
        label: "@严守-人类中心主义哲学家",
        roleId: "strict-humanist",
      }),
    );
  });
});
