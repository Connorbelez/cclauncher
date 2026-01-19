export const theme = {
    colors: {
        background: "#1a1b26",    // Deep background (main surfaces)
        surface: "#24283b",       // Elevated surface (cards, sections)
        surfaceHighlight: "#292e42", // Slightly lighter surface
        border: "#414868",        // Muted elements (borders, dividers)
        primary: "#7aa2f7",       // Primary accent (focused elements)
        secondary: "#bb9af7",     // Secondary accent (labels)
        success: "#9ece6a",       // Success/Save actions
        error: "#f7768e",         // Required/Error indicators
        warning: "#e0af68",       // Warning/Caution indicators
        text: {
            primary: "#c0caf5",   // Primary text
            secondary: "#565f89", // Dimmed/secondary text
            muted: "#414868",     // Very dimmed text
        }
    },
    borders: {
        rounded: "rounded" as const,
        double: "double" as const,
        single: "single" as const,
    }
};
