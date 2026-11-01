/** Joins class names, skipping falsy ones: cx(styles.badge, fresh && styles.fresh). */
export const cx = (...classes: (string | false | null | undefined)[]) =>
	classes.filter(Boolean).join(' ');
