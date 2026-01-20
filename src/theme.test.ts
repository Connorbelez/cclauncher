import { describe, expect, it } from "vitest";
import { theme } from "./theme";

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

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
			expect(theme.colors.background).toMatch(HEX_COLOR_REGEX);
			expect(theme.colors.surface).toMatch(HEX_COLOR_REGEX);
			expect(theme.colors.surfaceHighlight).toMatch(HEX_COLOR_REGEX);
			expect(theme.colors.border).toMatch(HEX_COLOR_REGEX);
			expect(theme.colors.primary).toMatch(HEX_COLOR_REGEX);
			expect(theme.colors.secondary).toMatch(HEX_COLOR_REGEX);
			expect(theme.colors.success).toMatch(HEX_COLOR_REGEX);
			expect(theme.colors.error).toMatch(HEX_COLOR_REGEX);
			expect(theme.colors.warning).toMatch(HEX_COLOR_REGEX);
			expect(theme.colors.text.primary).toMatch(HEX_COLOR_REGEX);
			expect(theme.colors.text.secondary).toMatch(HEX_COLOR_REGEX);
			expect(theme.colors.text.muted).toMatch(HEX_COLOR_REGEX);
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
			const bgValue = Number.parseInt(theme.colors.background.slice(1), 16);
			const maxDarkValue = 0x3f_3f_3f; // Threshold for "dark"

			expect(bgValue).toBeLessThan(maxDarkValue);
		});

		it("should use blue-ish primary accent", () => {
			// Tokyo Night uses blue as primary
			const primaryHex = theme.colors.primary;
			const r = Number.parseInt(primaryHex.slice(1, 3), 16);
			const g = Number.parseInt(primaryHex.slice(3, 5), 16);
			const b = Number.parseInt(primaryHex.slice(5, 7), 16);

			// Blue should be the dominant component
			expect(b).toBeGreaterThan(r);
			expect(b).toBeGreaterThan(g * 0.8); // Allow some tolerance
		});

		it("should use purple-ish secondary accent", () => {
			// Tokyo Night uses purple/magenta as secondary
			const secondaryHex = theme.colors.secondary;
			const r = Number.parseInt(secondaryHex.slice(1, 3), 16);
			const g = Number.parseInt(secondaryHex.slice(3, 5), 16);
			const b = Number.parseInt(secondaryHex.slice(5, 7), 16);

			// Purple = high red and blue, lower green
			expect(r).toBeGreaterThan(g);
			expect(b).toBeGreaterThan(g);
		});
	});

	describe("Accessibility considerations", () => {
		it("should have sufficient contrast between text and background", () => {
			// Simple luminance calculation for contrast checking
			const getLuminance = (hex: string) => {
				const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
				const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
				const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
				return 0.299 * r + 0.587 * g + 0.114 * b;
			};

			const bgLuminance = getLuminance(theme.colors.background);
			const textLuminance = getLuminance(theme.colors.text.primary);

			// Contrast ratio should be significant (simplified check)
			const contrastDiff = Math.abs(textLuminance - bgLuminance);
			expect(contrastDiff).toBeGreaterThan(0.4);
		});

		it("should have distinct primary vs secondary text", () => {
			const primary = theme.colors.text.primary;
			const secondary = theme.colors.text.secondary;

			// Calculate actual luminance
			const getLuminance = (hex: string) => {
				const r = Number.parseInt(hex.slice(1, 3), 16);
				const g = Number.parseInt(hex.slice(3, 5), 16);
				const b = Number.parseInt(hex.slice(5, 7), 16);
				return 0.299 * r + 0.587 * g + 0.114 * b;
			};

			const pLum = getLuminance(primary);
			const sLum = getLuminance(secondary);

			expect(Math.abs(pLum - sLum)).toBeGreaterThan(20);
		});
	});
});
