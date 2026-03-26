# Mobile Device Testing Matrix

This document outlines the testing procedures and device coverage for Wata-Board on mobile and tablet devices.

## Device Coverage Matrix

Tested devices and viewports configured in Playwright:

| Device | Type | Viewport Size | Operating System |
| --- | --- | --- | --- |
| **Pixel 5** | Mobile | 393 x 851 | Android |
| **iPhone 12** | Mobile | 390 x 844 | iOS |
| **iPhone SE** | Small Mobile | 375 x 667 | iOS |
| **Samsung Galaxy S22** | Mobile | 360 x 780 | Android |
| **iPad Air** | Tablet | 820 x 1180 | iPadOS |
| **iPad Pro 11** | Large Tablet | 834 x 1194 | iPadOS |

## Testing Procedures

### 1. Automated Responsive Tests
Run tests that specifically check layout shifts and menu visibility:
```bash
npm run test -- --project="Mobile Chrome" --project="Mobile Safari" --project="iPhone SE"
```

### 2. Manual Visual Inspection
Ensure all elements are readable and correctly sized:
- Use Chrome DevTools (F12 > Device Toolbar).
- Test with "Responsive" mode and drag the handles.
- Test with specific presets (Pixel, iPhone, iPad).

### 3. Touch Interaction Validation
Verify all tap targets follow the **48x48dp rule** (min 32x32px in modern responsive design):
- No two interactive elements should be within 8px of each other.
- All buttons and links must be accessible via touch.

### 4. Performance Benchmarks
All mobile pages should meet these targets:
- **LCP (Largest Contentful Paint)**: < 2.5s
- **CLS (Cumulative Layout Shift)**: < 0.1
- **FID (First Input Delay)**: < 100ms

## Automated Tests Coverage

The following test files provide mobile-specific coverage:
- `tests/mobile/responsive.spec.ts`: Checks layout adaptations and breakpoints.
- `tests/mobile/touch.spec.ts`: Validates touch events and tap targets.
- `tests/mobile/performance.spec.ts`: Benchmarks load times and interaction responsiveness on mobile viewports.

## Continuous Integration

Mobile tests are integrated into the standard testing pipeline and run for every PR using Playwright projects.
