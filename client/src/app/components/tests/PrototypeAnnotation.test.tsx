import { render, screen } from "@app/test-config/test-utils";

import {
  PrototypeAnnotation,
  PrototypeAnnotationContext,
} from "../PrototypeAnnotation";

describe("PrototypeAnnotation", () => {
  it("renders nothing outside the prototype shell", () => {
    render(<PrototypeAnnotation>Review note</PrototypeAnnotation>);
    expect(screen.queryByText("Review note")).not.toBeInTheDocument();
  });

  it("renders its children inside the prototype shell", () => {
    render(
      <PrototypeAnnotationContext.Provider value>
        <PrototypeAnnotation>Review note</PrototypeAnnotation>
      </PrototypeAnnotationContext.Provider>
    );
    expect(screen.getByText("Review note")).toBeInTheDocument();
  });
});
