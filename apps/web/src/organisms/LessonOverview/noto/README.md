# Noto animated emoji

Still artwork (`<codepoint>.svg`) and Lottie animations (`<codepoint>.json`) from Google's
[Noto Animated Emoji](https://googlefonts.github.io/noto-emoji-animation/), downloaded from
`https://fonts.gstatic.com/s/e/notoemoji/latest/<codepoint>/{emoji.svg,lottie.json}` on 2026-10-10.

They are kept here so the app serves them from its own origin (see `docs/security-and-privacy.md`). The lesson index's
category badges and the lesson overview prototype use them, through `../notoEmoji.ts`, and production builds include them.
Noto Animated Emoji are licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); Settings carries the credit.
