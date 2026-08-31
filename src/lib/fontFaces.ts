// Registers the @font-face rules for every font in FONT_OPTIONS (see fonts.ts).
// Browsers only download the actual .woff2 files for the unicode ranges/weights a
// page ends up using (each rule below carries a `unicode-range`), so importing every
// family here doesn't mean every family gets downloaded — only whichever one(s) are
// actually applied to visible text do.
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/lora";
import "@fontsource-variable/outfit";
import "@fontsource-variable/sora";
import "@fontsource-variable/manrope";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/inter";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/geist";
import "@fontsource/ibm-plex-sans";
import "@fontsource/ibm-plex-mono";
import "@fontsource/poppins";
