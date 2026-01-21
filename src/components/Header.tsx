import { TextAttributes } from "@opentui/core";
import { useFocusContext } from "@/hooks/FocusProvider";
import { theme } from "@/theme";

export interface HeaderProps {
	/** Optional subtitle text displayed below the logo */
	subtitle?: string;
}

/**
 * Render a stylized header with the CCLauncher ASCII art logo and an optional subtitle.
 * Hides the subtitle when in edit mode or viewing the new model form to avoid overlap.
 */
export function Header({ subtitle = "Claude Code your way" }: HeaderProps) {
	const { focusedId, editMode } = useFocusContext();

	// Hide subtitle when editing or creating a new model to prevent overlap
	const showSubtitle = !editMode && focusedId !== "new_model";

	return (
		<box
			alignItems="center"
			flexDirection="column"
			justifyContent="center"
			style={{ paddingTop: 0, paddingBottom: 0, marginBottom: 1 }}
		>
			<ascii-font font="tiny" text="CCLauncher" />
			<box height={1}>
				{showSubtitle && (
					<text
						attributes={TextAttributes.DIM}
						style={{ fg: theme.colors.text.secondary }}
					>
						{subtitle}
					</text>
				)}
			</box>
		</box>
	);
}
