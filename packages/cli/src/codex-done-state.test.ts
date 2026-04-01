import { describe, expect, it } from "vitest";
import { buildDoneStateInstructions } from "./done-state";

describe("buildDoneStateInstructions", () => {
  it("uses plain-language next steps for interactive prompts", () => {
    const instructions = buildDoneStateInstructions({
      mode: "interactive",
      readyLabel: "Ready to commit",
    }).join("\n");

    expect(instructions).toContain("✅ Implementation complete");
    expect(instructions).toContain(
      "add a short explanation of how to see the change in action"
    );
    expect(instructions).toContain(
      "continue by giving further instruction or type `/exit`"
    );
    expect(instructions).toContain(
      "do not present numbered menus or tell the user to pick from fixed option labels"
    );
    expect(instructions).not.toContain("[1] Continue refining");
    expect(instructions).not.toContain("/commit");
  });

  it("keeps non-interactive prompts from asking for more input", () => {
    const instructions = buildDoneStateInstructions({
      mode: "non-interactive",
      readyLabel: "Ready for the next automation step",
    }).join("\n");

    expect(instructions).toContain("✅ Implementation complete");
    expect(instructions).toContain(
      "add a short explanation of how to see the change in action"
    );
    expect(instructions).toContain(
      "do not ask for input or wait for a reply after printing the done state"
    );
    expect(instructions).not.toContain("continue by giving further instruction");
    expect(instructions).not.toContain("[1] Continue refining");
  });
});
