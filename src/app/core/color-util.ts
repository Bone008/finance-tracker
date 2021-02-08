import { getRandomInt } from "./util";

// From: https://stackoverflow.com/a/4382138
const kellyColorSet = [
  '#FFB300', // Vivid Yellow
  '#803E75', // Strong Purple
  '#FF6800', // Vivid Orange
  '#A6BDD7', // Very Light Blue
  '#C10020', // Vivid Red
  '#CEA262', // Grayish Yellow
  '#817066', // Medium Gray

  '#007D34', // Vivid Green
  '#F6768E', // Strong Purplish Pink
  '#00538A', // Strong Blue
  '#FF7A5C', // Strong Yellowish Pink
  '#53377A', // Strong Violet
  '#FF8E00', // Vivid Orange Yellow
  '#B32851', // Strong Purplish Red
  '#F4C800', // Vivid Greenish Yellow
  '#7F180D', // Strong Reddish Brown
  '#93AA00', // Vivid Yellowish Green
  '#593315', // Deep Yellowish Brown
  '#F13A13', // Vivid Reddish Orange
  '#232C16', // Dark Olive Green
];

/**
 * Returns a distinct color as a CSS string to be used in a palette.
 * If possible, same indices return the same color.
 */
export function getPaletteColor(index: number): string {
  if (index >= 0 && index < kellyColorSet.length) {
    return kellyColorSet[index];
  } else {
    return generateRandomColor();
  }
}

/** Returns a random color as a CSS string. */
export function generateRandomColor(): string {
  return 'rgb('
    + getRandomInt(0, 256) + ','
    + getRandomInt(0, 256) + ','
    + getRandomInt(0, 256) + ')';
}

/** Parses a color string in the format '#rrggbb' into RGB numbers (0-255). */
function hexColorToRgb(color: string): { r: number, g: number, b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
  if (!result) return null;
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
};

/** Returns a color as a hex color string that is of good contrast on a background. */
export function getContrastingColor(backgroundColor: string): string {
  const rgb = hexColorToRgb(backgroundColor);
  if (!rgb) {
    // That's too bad.
    return '#000000';
  }
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b);
  return luminance < 140 ? "#ffffff" : "#000000";
}
