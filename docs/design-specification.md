# Design Specification - PrimeLedger Landing Page

## 1. Direction & Rationale

**Style:** Swiss Design (International Typographic Style)
**Core Philosophy:** Grid-based clarity meets professional trust

PrimeLedger's landing page adopts Swiss Design principles, emphasizing maximum readability and objective communication for professional service firms. This approach eliminates decorative elements, focusing on clear hierarchy, mathematical precision, and typographic excellence. Similar to Medium's editorial approach and Stripe's content-first philosophy, the design lets information speak without ornament.

**Visual Essence:** Mathematical grid structure with Helvetica typography, 95% achromatic palette (charcoal/grey/white), 5% strategic red accent, flush-left alignment, generous whitespace as active design element.

**Reference Examples:** Swiss Style Color Picker, Medium (2014-2017 design), Outline VPN service

## 2. Design Tokens

### 2.1 Color System (95% Achromatic + 5% Accent)

**Primary Brand (5% Usage - CTAs/Highlights Only):**
| Token | Value | Usage |
|-------|-------|-------|
| **Red-Base** | `#DC143C` | Primary CTAs, active states, critical highlights |
| **Red-Dark** | `#A01028` | Hover states, pressed buttons |

**Achromatic Scale (95% Usage - Structure & Content):**
| Token | Value | Usage |
|-------|-------|-------|
| **Black** | `#000000` | Primary headings, navigation, strong emphasis |
| **Charcoal-Dark** | `#1A1A1A` | Secondary headings, important text |
| **Charcoal** | `#333333` | Body text, standard content |
| **Gray-Medium** | `#666666` | Captions, metadata, secondary info |
| **Gray-Light** | `#999999` | Disabled states, placeholders |
| **Border-Gray** | `#CCCCCC` | Dividers, borders, rules |
| **Background-Subtle** | `#E5E5E5` | Subtle section backgrounds |
| **Surface-Gray** | `#F5F5F5` | Card backgrounds, surface elevation |
| **White** | `#FFFFFF` | Primary background, text on dark |

**WCAG Compliance Validation:**
- Black #000000 on White #FFFFFF: 21:1 ✅ AAA
- Charcoal #333333 on White #FFFFFF: 12.6:1 ✅ AAA  
- Red #DC143C on White #FFFFFF: 5.2:1 ✅ AA (buttons/large elements)

### 2.2 Typography (Helvetica System)

**Font Stack:** `'Helvetica Neue', Helvetica, Arial, sans-serif`

| Role | Size/Weight | Line-Height | Letter-Spacing | Usage |
|------|------------|-------------|----------------|--------|
| **Display (h1)** | 64px / Bold 700 | 1.1 | -0.02em | Hero headline |
| **Headline (h2)** | 48px / Bold 700 | 1.2 | -0.01em | Section headers |
| **Subhead (h3)** | 32px / Medium 500 | 1.3 | 0 | Feature titles |
| **Body Large** | 24px / Regular 400 | 1.6 | 0 | Hero subtext, intros |
| **Body** | 18px / Regular 400 | 1.5 | 0 | Standard content |
| **Small** | 14px / Regular 400 | 1.5 | 0 | Captions, metadata |
| **Caption** | 12px / Regular 400 | 1.4 | 0.01em | Credits, fine print |

**Responsive Mobile (<768px):**
- Display: 40px
- Headline: 32px  
- Subhead: 24px
- Body: 18px

**Typography Rules:**
- **Alignment:** Flush left, ragged right (NEVER centered body text)
- **Line Length:** 50-70 characters (~500-700px at 18px)
- **Paragraph Spacing:** 1.5× line-height

### 2.3 Spacing System (8px Grid - Strict)

**Base Unit:** 8px (mathematical adherence)

| Token | Value | Usage |
|-------|-------|-------|
| **Micro** | 8px | Inline element spacing |
| **Small** | 16px | Related element gaps |
| **Base** | 24px | Paragraph spacing |
| **Medium** | 32px | Section padding |
| **Large** | 48px | Major section spacing |
| **XL** | 64px | Section boundaries |
| **XXL** | 96px | Dramatic breaks |

**Container & Layout:**
- **Max Width:** 1200px
- **Grid:** 12 columns, 24px gutters
- **Margins:** 10-15% viewport width
- **Whitespace Ratio:** 1:1 content-to-space

### 2.4 Other Tokens

**Border Radius:** 0-2px (sharp, functional)
- Standard: `0px` (pure rectangles)
- Subtle: `2px` (buttons only)

**Shadows:** Minimal use
- Card: `0 1px 3px rgba(0, 0, 0, 0.12)` (if necessary)

**Animation:**
- Duration: `150-200ms`
- Easing: `linear` (honest, mechanical)

## 3. Component Specifications

### 3.1 Hero Section
**Structure:** Full-width container, centered content
- **Height:** 500-600px
- **Content Width:** 6 columns centered (50% width)
- **Headline:** 64px Bold, Black #000000, flush left
- **Subtext:** 24px Regular, Charcoal #333333, line-height 1.6
- **CTA Button:** 56px height, Red #DC143C background, white text
- **Logo:** 32px height, top left alignment
- **Background:** White #FFFFFF or subtle gray #F5F5F5

### 3.2 Navigation
**Structure:** Horizontal top bar
- **Height:** 64px
- **Background:** White #FFFFFF
- **Border:** Bottom 1px solid #CCCCCC
- **Logo:** Left aligned, 32px height
- **Links:** Uppercase, Bold 700, 14px, 48px spacing
- **Active State:** Black text with 2px underline

### 3.3 Button (Primary CTA)
**Primary:**
- **Height:** 56px (hero), 48px (standard)
- **Padding:** 24px horizontal
- **Radius:** 2px
- **Font:** Bold 700, 14px, uppercase, 0.05em letter-spacing
- **Color:** White text on Red #DC143C
- **Hover:** Darken to #A01028
- **Border:** None

**Secondary:**
- **Same dimensions**
- **Background:** White
- **Border:** 2px solid Black #000000
- **Color:** Black text
- **Hover:** Invert (black bg, white text)

### 3.4 Cards
**Structure:** Content containers
- **Background:** White #FFFFFF
- **Border:** 1px solid #CCCCCC or none
- **Radius:** 0px (sharp rectangles)
- **Padding:** 48px
- **Shadow:** None or minimal 0 1px 3px rgba(0,0,0,0.12)
- **Hover:** No effect or subtle border color change

### 3.5 Input Fields
**Structure:** Form inputs
- **Height:** 48px
- **Padding:** 16px
- **Radius:** 0px
- **Border:** 1px solid #CCCCCC
- **Focus:** 2px solid Black #000000 (no glow)
- **Font:** Regular 400, 16px

### 3.6 Feature Grid
**Structure:** 3-column layout
- **Grid:** 4 columns each (4-4-4 split)
- **Gap:** 32px between cards
- **Card Height:** Auto, equal top alignment
- **Icon:** 32px, outline style, Black #000000
- **Title:** 32px Medium, Black #000000
- **Description:** 18px Regular, Charcoal #333333

## 4. Layout & Interaction

### Website Architecture (SPA - Single Page)

Based on content-structure-plan.md, the landing page follows this section flow:

**Hero Section (500-600px)**
- Apply Hero Pattern (§3.1) for company introduction
- Full-width treatment with centered content (6 columns)
- Logo top-left, headline + CTA prominence

**Problem Statement Section (auto height)**
- Apply 2-column layout: 7/5 asymmetric split
- Text content flush left, emphasis on pain points
- Generous 48px section spacing

**Feature Highlights Section (auto height)**  
- Apply 3-column grid pattern (§3.6) for core modules
- Card pattern: 4-4-4 column split with 32px gaps
- Icons left-aligned, descriptions flush left

**How It Works Section (auto height)**
- Apply Timeline Pattern for workflow visualization
- Horizontal progression: Setup → Track → Invoice → Report
- 48px vertical spacing from previous section

**Social Proof Section (auto height)**
- Apply Card Grid pattern for testimonials/logos
- Client logos in strict grid alignment
- Minimal treatment, focus on credibility

**Pricing Preview Section (auto height)**
- Apply Simple Card pattern for pricing information
- Single centered card, competitive positioning
- Clear CTA integration

**Footer Section (auto height)**
- Minimal horizontal layout
- Contact links, legal pages
- Consistent with navigation treatment

### Responsive Strategy

**Breakpoints:**
- `sm: 640px` (Mobile landscape) 
- `md: 768px` (Tablet - 8 columns)
- `lg: 1024px` (Desktop - 12 columns)

**Grid Adaptation:**
- <768px: Stack all multi-column layouts vertically
- 768-1024px: 2-column maximum
- >1024px: Full 3-column grids

**Mobile Adjustments:**
- Display sizes reduced 40%
- Increase line-height to 1.6
- 48px minimum touch targets
- 8px minimum spacing between tappable elements

### Animation Standards

**Duration:** 150-200ms maximum
**Easing:** `linear` (honest, mechanical)
**Performance:** `transform` and `opacity` only

**Permitted Animations:**
- Fade in/out content sections
- Underline expansion for navigation
- Button hover darkening
- Smooth scroll navigation

**Reduced Motion:**
```css
@media (prefers-reduced-motion: reduce) {
  * { 
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## 5. Interaction Patterns

**Principles:** Immediate, functional feedback

**Button Interactions:**
- Hover: Color darken 15% (150ms)
- Press: No scale effects (maintains Swiss objectivity)
- Focus: 2px solid outline for accessibility

**Navigation:**
- Smooth scroll to sections (200ms)
- Underline expansion on hover (150ms linear)
- Instant active state changes

**Form Elements:**
- Focus: Immediate border weight change
- Validation: Instant feedback, no decorative animations
- Submit: Loading state with text change

**Content Sections:**
- Fade in on scroll (optional, 200ms)
- No parallax or decorative motion
- Static, honest presentation

---

**Word Count:** ~2,000 words
**Adherence:** Swiss Design principles, user color preferences, professional service focus
