// tests/utils/validation.test.ts
// validateAcceptanceCriteria 边缘情况测试

import { describe, it, expect } from "vitest";
import { validateAcceptanceCriteria } from "../../src/utils/validation.js";
import { TanmiError } from "../../src/types/errors.js";

describe("validateAcceptanceCriteria", () => {
  describe("valid cases", () => {
    it("should accept undefined", () => {
      expect(() => validateAcceptanceCriteria(undefined)).not.toThrow();
    });

    it("should accept empty array", () => {
      expect(() => validateAcceptanceCriteria([])).not.toThrow();
    });

    it("should accept valid { when, then } object", () => {
      expect(() =>
        validateAcceptanceCriteria([{ when: "条件", then: "结果" }])
      ).not.toThrow();
    });

    it("should accept multiple valid objects", () => {
      expect(() =>
        validateAcceptanceCriteria([
          { when: "条件1", then: "结果1" },
          { when: "条件2", then: "结果2" },
        ])
      ).not.toThrow();
    });

    it("should accept objects with extra fields", () => {
      expect(() =>
        validateAcceptanceCriteria([
          { when: "条件", then: "结果", extra: "额外字段" },
        ])
      ).not.toThrow();
    });
  });

  describe("invalid cases - string instead of object", () => {
    it("should reject plain string", () => {
      expect(() =>
        validateAcceptanceCriteria(["string value"])
      ).toThrow(TanmiError);
    });

    it("should reject mixed array (valid + string)", () => {
      expect(() =>
        validateAcceptanceCriteria([
          { when: "条件", then: "结果" },
          "invalid string",
        ])
      ).toThrow(TanmiError);
    });

    it("should include string value in error message", () => {
      try {
        validateAcceptanceCriteria(["my string"]);
        expect.fail("Should have thrown");
      } catch (e) {
        expect((e as TanmiError).message).toContain("my string");
      }
    });
  });

  describe("invalid cases - missing fields", () => {
    it("should reject object without when field", () => {
      expect(() =>
        validateAcceptanceCriteria([{ then: "结果" }] as unknown[])
      ).toThrow(TanmiError);
    });

    it("should reject object without then field", () => {
      expect(() =>
        validateAcceptanceCriteria([{ when: "条件" }] as unknown[])
      ).toThrow(TanmiError);
    });

    it("should reject empty object", () => {
      expect(() => validateAcceptanceCriteria([{}])).toThrow(TanmiError);
    });
  });

  describe("invalid cases - wrong field types", () => {
    it("should reject when as number", () => {
      expect(() =>
        validateAcceptanceCriteria([{ when: 123, then: "结果" }] as unknown[])
      ).toThrow(TanmiError);
    });

    it("should reject then as null", () => {
      expect(() =>
        validateAcceptanceCriteria([{ when: "条件", then: null }] as unknown[])
      ).toThrow(TanmiError);
    });

    it("should reject when as undefined", () => {
      expect(() =>
        validateAcceptanceCriteria([
          { when: undefined, then: "结果" },
        ] as unknown[])
      ).toThrow(TanmiError);
    });
  });

  describe("invalid cases - other types", () => {
    it("should reject null element", () => {
      expect(() => validateAcceptanceCriteria([null] as unknown[])).toThrow(
        TanmiError
      );
    });

    it("should reject number element", () => {
      expect(() => validateAcceptanceCriteria([123] as unknown[])).toThrow(
        TanmiError
      );
    });

    it("should reject array element", () => {
      expect(() => validateAcceptanceCriteria([[1, 2, 3]])).toThrow(TanmiError);
    });
  });

  describe("fieldPrefix parameter", () => {
    it("should use custom fieldPrefix in error message", () => {
      try {
        validateAcceptanceCriteria(["bad"], "exec.acceptanceCriteria");
        expect.fail("Should have thrown");
      } catch (e) {
        expect((e as TanmiError).message).toContain("exec.acceptanceCriteria[0]");
      }
    });

    it("should use default fieldPrefix if not provided", () => {
      try {
        validateAcceptanceCriteria(["bad"]);
        expect.fail("Should have thrown");
      } catch (e) {
        expect((e as TanmiError).message).toContain("acceptanceCriteria[0]");
      }
    });
  });

  describe("edge cases", () => {
    it("should accept empty string values for when/then", () => {
      // 这是一个边缘情况：空字符串虽然不好，但类型是对的
      expect(() =>
        validateAcceptanceCriteria([{ when: "", then: "" }])
      ).not.toThrow();
    });

    it("should report correct index for invalid element", () => {
      try {
        validateAcceptanceCriteria([
          { when: "a", then: "b" },
          { when: "c", then: "d" },
          "invalid at index 2",
        ]);
        expect.fail("Should have thrown");
      } catch (e) {
        expect((e as TanmiError).message).toContain("[2]");
      }
    });
  });
});
