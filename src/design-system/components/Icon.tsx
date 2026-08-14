import type { IconName } from './types';

export type IconWeight = 'regular' | 'bold' | 'fill';

export interface IconProps {
  name: IconName;
  /** Pixel size. Defaults to the icon font's own `--icon-size-md`. */
  size?: number;
  weight?: IconWeight;
  className?: string;
  /**
   * Icons are decorative by default and hidden from assistive tech — the design system's
   * rule is that every state carries a word as well as a glyph, so the word is what gets
   * announced. Pass a label only for the rare standalone-meaning icon.
   */
  label?: string;
}

const WEIGHT_CLASS: Record<IconWeight, string> = {
  regular: 'ph',
  bold: 'ph-bold',
  fill: 'ph-fill',
};

export function Icon({ name, size, weight = 'regular', className = '', label }: IconProps) {
  return (
    <i
      className={`${WEIGHT_CLASS[weight]} ph-${name} ${className}`.trim()}
      style={size ? { fontSize: `${size}px` } : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}
