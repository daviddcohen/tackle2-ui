import {
  deleteActionProps,
  disabledActionProps,
  isOperatorManaged,
  managedActionProps,
} from "./agentic";

const shipped = {
  metadata: {
    labels: { "app.kubernetes.io/managed-by": "agentic-controller-defaults" },
  },
};

describe("operator-managed defaults", () => {
  it("recognizes the operator's curated defaults by their marker label", () => {
    expect(isOperatorManaged(shipped)).toBe(true);
  });

  it("leaves user-created resources editable", () => {
    expect(isOperatorManaged({ metadata: {} })).toBe(false);
    expect(
      isOperatorManaged({
        metadata: { labels: { "app.kubernetes.io/managed-by": "kustomize" } },
      })
    ).toBe(false);
    // konveyor.io/managed means "needs Hub context", not "operator-owned".
    expect(
      isOperatorManaged({
        metadata: { labels: { "konveyor.io/managed": "true" } },
      })
    ).toBe(false);
  });

  it("disables an action for a domain object with operatorManaged set", () => {
    expect(managedActionProps(true, "why")).toEqual({
      isAriaDisabled: true,
      tooltipProps: { content: "why" },
    });
    expect(managedActionProps(false, "why")).toEqual({});
    // The prototype API never sets the flag.
    expect(managedActionProps(undefined, "why")).toEqual({});
  });

  it("places the tooltip when asked, as a row Delete does", () => {
    expect(managedActionProps(true, "why", "left")).toEqual({
      isAriaDisabled: true,
      tooltipProps: { content: "why", position: "left" },
    });
    expect(disabledActionProps("In use", "left")).toEqual({
      isAriaDisabled: true,
      tooltipProps: { content: "In use", position: "left" },
    });
    expect(disabledActionProps(undefined, "left")).toEqual({});
  });

  it("disables any action that has a reason, and only then", () => {
    expect(disabledActionProps("In use")).toEqual({
      isAriaDisabled: true,
      tooltipProps: { content: "In use" },
    });
    expect(disabledActionProps(undefined)).toEqual({});
  });

  it("makes a row Delete danger only while it is enabled", () => {
    expect(deleteActionProps(undefined)).toEqual({ isDanger: true });
    expect(deleteActionProps("In use")).toEqual({
      isDanger: false,
      isAriaDisabled: true,
      tooltipProps: { content: "In use", position: "left" },
    });
  });
});
