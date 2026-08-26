// Curated font catalog pulled from the pod's preinstalled @fontsource manifest.
// Used by the toolbar's per-selection font picker AND the "Global Font" switch.
export interface FontOption {
  label: string;
  value: string; // CSS font-family value understood by execCommand('fontName', ...)
}

export const FONT_OPTIONS: FontOption[] = [
  { label: "DM Sans", value: "'DM Sans Variable', sans-serif" },
  { label: "Plus Jakarta Sans", value: "'Plus Jakarta Sans Variable', sans-serif" },
  { label: "Playfair Display", value: "'Playfair Display Variable', serif" },
  { label: "Lora", value: "'Lora Variable', serif" },
  { label: "Outfit", value: "'Outfit Variable', sans-serif" },
  { label: "Sora", value: "'Sora Variable', sans-serif" },
  { label: "Manrope", value: "'Manrope Variable', sans-serif" },
  { label: "Space Grotesk", value: "'Space Grotesk Variable', sans-serif" },
  { label: "JetBrains Mono", value: "'JetBrains Mono Variable', monospace" },
  { label: "Inter", value: "'Inter Variable', sans-serif" },
  { label: "Instrument Sans", value: "'Instrument Sans Variable', sans-serif" },
  { label: "Geist", value: "'Geist Variable', sans-serif" },
  { label: "IBM Plex Sans", value: "'IBM Plex Sans', sans-serif" },
  { label: "IBM Plex Mono", value: "'IBM Plex Mono', monospace" },
  { label: "Poppins", value: "'Poppins', sans-serif" },
];

export const FONT_SIZE_OPTIONS = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];
