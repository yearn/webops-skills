---
name: yearn-branding
description: add Yearn brand assets (logo, favicon) to projects
---

## Activation Criteria
Use this skill when:
- Setting up a new Yearn project
- Fixing missing brand assets (logo, favicon)

## Source of Truth

https://presskit.yearn.fi

## Assets

### Logo
- **Source:** https://presskit.yearn.fi (download SVG/PNG)
- **Variants:** Full-color, white (dark bg), black (mono)
- **Target:** `public/yearn-logo.svg`
- **Min size:** 85px (screen), 30mm (print)

### Symbol (Y icon)
- **Source:** https://presskit.yearn.fi
- **Target:** `public/yearn-symbol.svg`
- **Min size:** 40px (screen), 15mm (print)

### Favicon
- **Source:** https://yearn.fi/favicon.ico
- **Target:** `public/favicon.ico`

## Workflow

1. **Gather requirements** - Use `AskUserQuestion` to clarify:
   - Logo type: Full wordmark or Y symbol only?
   - Color variant: Full-color, white, or black?
   - Which assets needed: Logo, favicon, or both?

2. Create `public/` folder if missing

3. Download assets from presskit.yearn.fi

4. Verify assets render correctly

## Notes
- Next.js serves static assets from `public/` at root path
- Logo referenced as `/yearn-logo.svg` in code
- Use white logo variant on dark backgrounds
