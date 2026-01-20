import { describe, it, expect } from "vitest";
import { theme } from "./theme";

describe("Theme configuration", () => {
  describe("Colors", () => {
    it("should have all required color properties", () => {
      expect(theme.colors).toBeDefined();
      expect(theme.colors.background).toBeDefined();
      expect(theme.colors.surface).toBeDefined();
      expect(theme.colors.surfaceHighlight).toBeDefined();
      expect(theme.colors.border).toBeDefined();
      expect(theme.colors.primary).toBeDefined();
      expect(theme.colors.secondary).toBeDefined();
      expect(theme.colors.success).toBeDefined();
      expect(theme.colors.error).toBeDefined();
      expect(theme.colors.warning).toBeDefined();
    });

    it("should have text color variants", () => {
      expect(theme.colors.text).toBeDefined();
      expect(theme.colors.text.primary).toBeDefined();
      expect(theme.colors.text.secondary).toBeDefined();
      expect(theme.colors.text.muted).toBeDefined();
    });

    it("should use valid hex color format", () => {
      const hexPattern = /^#[0-9a-fA-F]{6}$/;

      expect(theme.colors.background).toMatch(hexPattern);
      expect(theme.colors.surface).toMatch(hexPattern);
      expect(theme.colors.surfaceHighlight).toMatch(hexPattern);
      expect(theme.colors.border).toMatch(hexPattern);
      expect(theme.colors.primary).toMatch(hexPattern);
      expect(theme.colors.secondary).toMatch(hexPattern);
      expect(theme.colors.success).toMatch(hexPattern);
      expect(theme.colors.error).toMatch(hexPattern);
      expect(theme.colors.warning).toMatch(hexPattern);
      expect(theme.colors.text.primary).toMatch(hexPattern);
      expect(theme.colors.text.secondary).toMatch(hexPattern);
      expect(theme.colors.text.muted).toMatch(hexPattern);
    });

    it("should have distinct colors for different purposes", () => {
      // Ensure semantic colors are different
      expect(theme.colors.success).not.toBe(theme.colors.error);
      expect(theme.colors.error).not.toBe(theme.colors.warning);
      expect(theme.colors.primary).not.toBe(theme.colors.secondary);

      // Background layers should be distinct
      expect(theme.colors.background).not.toBe(theme.colors.surface);
      expect(theme.colors.surface).not.toBe(theme.colors.surfaceHighlight);
    });
  });

  describe("Borders", () => {
    it("should have all border styles", () => {
      expect(theme.borders).toBeDefined();
      expect(theme.borders.rounded).toBe("rounded");
      expect(theme.borders.double).toBe("double");
      expect(theme.borders.single).toBe("single");
    });

    it("should have correct const assertions", () => {
      // TypeScript const assertions should make these literal types
      const borderTypes: ("rounded" | "double" | "single")[] = [
        theme.borders.rounded,
        theme.borders.double,
        theme.borders.single,
      ];

      expect(borderTypes).toHaveLength(3);
    });
  });

  describe("Tokyo Night theme inspiration", () => {
    it("should use dark background colors", () => {
      // Tokyo Night uses dark blues for backgrounds
      // Hex colors starting with low values indicate dark colors
      const bgValue = parseInt(theme.colors.background.slice(1), 16);
      const maxDarkValue = 0x3f3f3f; // Threshold for "dark"

      expect(bgValue).toBeLessThan(maxDarkValue);
    });

    it("should use blue-ish primary accent", () => {
      // Tokyo Night uses blue as primary
      const primaryHex = theme.colors.primary;
      const r = parseInt(primaryHex.slice(1, 3), 16);
      const g = parseInt(primaryHex.slice(3, 5), 16);
      const b = parseInt(primaryHex.slice(5, 7), 16);

      // Blue should be the dominant component
      expect(b).toBeGreaterThan(r);
      expect(b).toBeGreaterThan(g * 0.8); // Allow some tolerance
    });

    it("should use purple-ish secondary accent", () => {
      // Tokyo Night uses purple/magenta as secondary
      const secondaryHex = theme.colors.secondary;
      const r = parseInt(secondaryHex.slice(1, 3), 16);
      const g = parseInt(secondaryHex.slice(3, 5), 16);
      const b = parseInt(secondaryHex.slice(5, 7), 16);

      // Purple = high red and blue, lower green
      expect(r).toBeGreaterThan(g);
      expect(b).toBeGreaterThan(g);
    });
  });

  describe("Accessibility considerations", () => {
    it("should have sufficient contrast between text and background", () => {
      const toLinear = (channel: number) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };

      const getRelativeLuminance = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const rLin = toLinear(r);
        const gLin = toLinear(g);
        const bLin = toLinear(b);
        return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
      };

      const bgLuminance = getRelativeLuminance(theme.colors.background);
      const textLuminance = getRelativeLuminance(theme.colors.text.primary);
      const lighter = Math.max(bgLuminance, textLuminance);
      const darker = Math.min(bgLuminance, textLuminance);
      const contrastRatio = (lighter + 0.05) / (darker + 0.05);

      // WCAG AA contrast ratio for normal text
      expect(contrastRatio).toBeGreaterThanOrEqual(4.5);
    });

    it("should have distinct primary vs secondary text", () => {
      const primary = theme.colors.text.primary;
      const secondary = theme.colors.text.secondary;

      // Different luminance values
      const pLum = parseInt(primary.slice(1, 3), 16);
      const sLum = parseInt(secondary.slice(1, 3), 16);

      expect(Math.abs(pLum - sLum)).toBeGreaterThan(30);
    });
  });
});
