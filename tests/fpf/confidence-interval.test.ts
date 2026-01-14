import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import {
  autoConfidenceInterval,
  bootstrapInterval,
  formatConfidenceInterval,
  interJudgeInterval,
  intervalsOverlap,
  intervalWidth,
  mean,
  normalInterval,
  percentile,
  scoreWithJudgeConfidence,
  standardError,
  stdDev,
  tInterval,
  wilsonInterval,
} from "../../src/fpf/confidence-interval.ts";

describe("Statistical Utilities", () => {
  describe("mean", () => {
    it("should calculate mean correctly", () => {
      expect(mean([1, 2, 3, 4, 5])).toBe(3);
      expect(mean([0.5, 0.5, 0.5])).toBe(0.5);
    });

    it("should return 0 for empty array", () => {
      expect(mean([])).toBe(0);
    });

    it("should handle single value", () => {
      expect(mean([42])).toBe(42);
    });
  });

  describe("stdDev", () => {
    it("should calculate sample standard deviation", () => {
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const sd = stdDev(values);
      expect(sd).toBeCloseTo(2.138, 2);
    });

    it("should return 0 for single value", () => {
      expect(stdDev([5])).toBe(0);
    });

    it("should return 0 for empty array", () => {
      expect(stdDev([])).toBe(0);
    });
  });

  describe("standardError", () => {
    it("should calculate SE as SD/sqrt(n)", () => {
      const values = [1, 2, 3, 4, 5];
      const sd = stdDev(values);
      const se = standardError(values);
      expect(se).toBeCloseTo(sd / Math.sqrt(5), 6);
    });
  });

  describe("percentile", () => {
    it("should calculate percentiles correctly", () => {
      const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(percentile(sorted, 50)).toBe(5.5);
      expect(percentile(sorted, 0)).toBe(1);
      expect(percentile(sorted, 100)).toBe(10);
    });

    it("should interpolate between values", () => {
      const sorted = [0, 0.5, 1];
      expect(percentile(sorted, 50)).toBe(0.5);
      expect(percentile(sorted, 25)).toBe(0.25);
    });
  });
});

describe("Wilson Score Interval", () => {
  it("should calculate interval for 50% success rate", () => {
    const ci = wilsonInterval(50, 100, 0.95);
    expect(ci.estimate).toBe(0.5);
    expect(ci.lower).toBeLessThan(0.5);
    expect(ci.upper).toBeGreaterThan(0.5);
    expect(ci.method).toBe("wilson");
    expect(ci.n).toBe(100);
  });

  it("should handle 0% success rate", () => {
    const ci = wilsonInterval(0, 100, 0.95);
    expect(ci.estimate).toBe(0);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBeGreaterThan(0);
  });

  it("should handle 100% success rate", () => {
    const ci = wilsonInterval(100, 100, 0.95);
    expect(ci.estimate).toBe(1);
    expect(ci.lower).toBeLessThan(1);
    expect(ci.upper).toBeCloseTo(1, 6); // Floating point tolerance
  });

  it("should handle empty sample", () => {
    const ci = wilsonInterval(0, 0, 0.95);
    expect(ci.estimate).toBe(0);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBe(1);
    expect(ci.n).toBe(0);
  });

  it("should be asymmetric near boundaries", () => {
    // Wilson interval is not symmetric, especially near 0 or 1
    const ci = wilsonInterval(1, 100, 0.95);
    const distToLower = ci.estimate - ci.lower;
    const distToUpper = ci.upper - ci.estimate;
    expect(distToUpper).toBeGreaterThan(distToLower);
  });
});

describe("Bootstrap Interval", () => {
  it("should calculate interval for normal-ish data", () => {
    const values = [0.4, 0.45, 0.5, 0.55, 0.6];
    const ci = bootstrapInterval(values, 0.95, 500);
    expect(ci.estimate).toBeCloseTo(0.5, 1);
    expect(ci.lower).toBeLessThan(ci.estimate);
    expect(ci.upper).toBeGreaterThan(ci.estimate);
    expect(ci.method).toBe("bootstrap");
  });

  it("should handle single value", () => {
    const ci = bootstrapInterval([0.7], 0.95);
    expect(ci.estimate).toBe(0.7);
    expect(ci.lower).toBe(0.7);
    expect(ci.upper).toBe(0.7);
  });

  it("should handle empty array", () => {
    const ci = bootstrapInterval([], 0.95);
    expect(ci.estimate).toBe(0);
    expect(ci.n).toBe(0);
  });

  it("should narrow with more samples", () => {
    const smallSample = [0.5, 0.6];
    const largeSample = [0.5, 0.52, 0.54, 0.56, 0.58, 0.6];

    const ciSmall = bootstrapInterval(smallSample, 0.95, 500);
    const ciLarge = bootstrapInterval(largeSample, 0.95, 500);

    expect(intervalWidth(ciLarge)).toBeLessThan(intervalWidth(ciSmall));
  });
});

describe("T-Interval", () => {
  it("should calculate interval for small samples", () => {
    const values = [0.6, 0.65, 0.7, 0.75, 0.8];
    const ci = tInterval(values, 0.95);
    expect(ci.estimate).toBeCloseTo(0.7, 2);
    expect(ci.method).toBe("t-interval");
    expect(ci.n).toBe(5);
  });

  it("should be wider than normal interval for small n", () => {
    const values = [0.5, 0.6, 0.7];
    const tCI = tInterval(values, 0.95);
    const normalCI = normalInterval(values, 0.95);

    // T-interval should be wider due to t-distribution having heavier tails
    expect(intervalWidth(tCI)).toBeGreaterThanOrEqual(intervalWidth(normalCI));
  });

  it("should handle single value", () => {
    const ci = tInterval([0.5], 0.95);
    expect(ci.estimate).toBe(0.5);
    expect(ci.n).toBe(1);
  });
});

describe("Inter-Judge Interval", () => {
  it("should calculate interval from judge scores", () => {
    const judgeScores = [0.7, 0.75, 0.8];
    const ci = interJudgeInterval(judgeScores, 0.95);
    expect(ci.estimate).toBeCloseTo(0.75, 2);
    expect(ci.method).toBe("inter-judge");
    expect(ci.n).toBe(3);
  });

  it("should be wide for disagreeing judges", () => {
    const agreeing = [0.7, 0.71, 0.72];
    const disagreeing = [0.5, 0.7, 0.9];

    const ciAgree = interJudgeInterval(agreeing, 0.95);
    const ciDisagree = interJudgeInterval(disagreeing, 0.95);

    expect(intervalWidth(ciDisagree)).toBeGreaterThan(intervalWidth(ciAgree));
  });

  it("should handle single judge", () => {
    const ci = interJudgeInterval([0.8], 0.95);
    expect(ci.estimate).toBe(0.8);
    expect(ci.n).toBe(1);
  });
});

describe("Normal Interval", () => {
  it("should calculate symmetric interval", () => {
    const values = [0.4, 0.5, 0.6];
    const ci = normalInterval(values, 0.95);
    expect(ci.estimate).toBeCloseTo(0.5, 2);
    expect(ci.method).toBe("normal");

    // Check symmetry
    const distToLower = ci.estimate - ci.lower;
    const distToUpper = ci.upper - ci.estimate;
    expect(distToLower).toBeCloseTo(distToUpper, 6);
  });
});

describe("Auto Confidence Interval", () => {
  it("should use Wilson for binary data", () => {
    const binaryValues = [1, 1, 1, 0, 1, 1, 0, 1];
    const ci = autoConfidenceInterval(binaryValues, 0.95, true);
    expect(ci.method).toBe("wilson");
  });

  it("should use bootstrap for very small samples", () => {
    const values = [0.5, 0.6, 0.7];
    const ci = autoConfidenceInterval(values, 0.95, false);
    expect(ci.method).toBe("bootstrap");
  });

  it("should use t-interval for medium samples", () => {
    const values = Array(15)
      .fill(0)
      .map((_, i) => 0.5 + i * 0.01);
    const ci = autoConfidenceInterval(values, 0.95, false);
    expect(ci.method).toBe("t-interval");
  });

  it("should use normal for large samples", () => {
    const values = Array(50)
      .fill(0)
      .map(() => 0.5 + Math.random() * 0.1);
    const ci = autoConfidenceInterval(values, 0.95, false);
    expect(ci.method).toBe("normal");
  });
});

describe("Score With Confidence", () => {
  it("should create score with judge confidence", () => {
    const result = scoreWithJudgeConfidence([0.7, 0.75, 0.8], 0.95);
    expect(result.score).toBeCloseTo(0.75, 2);
    expect(result.confidence.method).toBe("inter-judge");
    expect(result.confidence.level).toBe(0.95);
  });
});

describe("Formatting", () => {
  it("should format confidence interval nicely", () => {
    const ci = {
      estimate: 0.75,
      lower: 0.65,
      upper: 0.85,
      level: 0.95,
      method: "inter-judge" as const,
      n: 3,
    };
    const formatted = formatConfidenceInterval(ci);
    expect(formatted).toContain("0.750");
    expect(formatted).toContain("[0.650, 0.850]");
    expect(formatted).toContain("95% CI");
    expect(formatted).toContain("n=3");
    expect(formatted).toContain("inter-judge");
  });
});

describe("Interval Comparison", () => {
  it("should detect overlapping intervals", () => {
    const a = {
      estimate: 0.5,
      lower: 0.4,
      upper: 0.6,
      level: 0.95,
      method: "normal" as const,
      n: 10,
    };
    const b = {
      estimate: 0.55,
      lower: 0.45,
      upper: 0.65,
      level: 0.95,
      method: "normal" as const,
      n: 10,
    };
    expect(intervalsOverlap(a, b)).toBe(true);
  });

  it("should detect non-overlapping intervals", () => {
    const a = {
      estimate: 0.3,
      lower: 0.2,
      upper: 0.4,
      level: 0.95,
      method: "normal" as const,
      n: 10,
    };
    const b = {
      estimate: 0.7,
      lower: 0.6,
      upper: 0.8,
      level: 0.95,
      method: "normal" as const,
      n: 10,
    };
    expect(intervalsOverlap(a, b)).toBe(false);
  });

  it("should detect touching intervals as overlapping", () => {
    const a = {
      estimate: 0.3,
      lower: 0.2,
      upper: 0.4,
      level: 0.95,
      method: "normal" as const,
      n: 10,
    };
    const b = {
      estimate: 0.5,
      lower: 0.4,
      upper: 0.6,
      level: 0.95,
      method: "normal" as const,
      n: 10,
    };
    expect(intervalsOverlap(a, b)).toBe(true);
  });

  it("should calculate interval width", () => {
    const ci = {
      estimate: 0.5,
      lower: 0.3,
      upper: 0.7,
      level: 0.95,
      method: "normal" as const,
      n: 10,
    };
    expect(intervalWidth(ci)).toBeCloseTo(0.4, 6); // Floating point tolerance
  });
});

describe("Bounds Clamping", () => {
  it("should clamp lower bound to 0", () => {
    const values = [0.05, 0.1, 0.15];
    const ci = tInterval(values, 0.95);
    expect(ci.lower).toBeGreaterThanOrEqual(0);
  });

  it("should clamp upper bound to 1", () => {
    const values = [0.9, 0.95, 0.98];
    const ci = tInterval(values, 0.95);
    expect(ci.upper).toBeLessThanOrEqual(1);
  });
});
