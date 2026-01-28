# Content Structure Plan - PrimeLedger Landing Page

## 1. Material Inventory

**Content Files:**
- `docs/research.md` (4,200 words, sections: BigTime analysis, market position, features, pricing, user feedback)
- `docs/bigtime_feature_spec.md` (2,800 words, sections: navigation structure, sales module, projects module, time tracking, invoicing, reporting)

**Visual Assets:**
- `imgs/` (15 files: logos, team photos, product mockups, feature screenshots)

**Data Files:**
- None currently available

**Charts:**
- None currently available

## 2. Website Structure

**Type:** SPA (Single Page Application)
**Reasoning:** Landing page format with ≤6 sections, focused conversion goal, cohesive story flow from problem → solution → proof → action. Single objective: convert visitors to trial/demo.

## 3. Page/Section Breakdown

### Page 1: PrimeLedger Landing Page (`/`)

**Purpose:** Convert professional service firms to request demo/start trial

**Content Mapping:**

| Section | Component Pattern | Data File Path | Content to Extract | Visual Asset (Content ONLY) |
|---------|------------------|----------------|-------------------|----------------------------|
| Hero | Hero Pattern | `docs/research.md` L1-45 | Professional services pain points, time tracking complexity | `imgs/logo.png` |
| Problem Statement | 2-column layout | `docs/research.md` L200-250 | BigTime user complaints: "time tracking tedious", billing complexity | - |
| Feature Highlights | 3-column grid | `docs/bigtime_feature_spec.md` L50-150 | Core modules: Time Tracking, Project Management, Invoicing, Expense Tracking | `imgs/feature-screenshots/` |
| How It Works | Timeline Pattern | `docs/bigtime_feature_spec.md` L200-300 | Workflow: Setup → Track → Invoice → Report | `imgs/workflow-mockups/` |
| Social Proof | Card Grid | `docs/research.md` L400-450 | BigTime user testimonials (adapt tone), industry success metrics | `imgs/client-logos/` |
| Pricing Preview | Simple Card | `docs/research.md` L300-350 | BigTime pricing analysis (position competitively) | - |
| CTA Section | Hero Pattern | Original content needed | Call-to-action: "Start Free Trial" / "Request Demo" | - |

**Content Extraction Rules:**
- **Hero Section**: Extract pain points from BigTime user feedback (L200-250) - "time tracking is tedious", "billing process complex"
- **Features**: Map BigTime modules (L50-150) to PrimeLedger equivalents: Sales Pipeline → Lead Management, Projects → Project Tracking, Time → Time Tracking, Invoicing → Automated Billing
- **Workflow**: Use BigTime's navigation structure (L200-300) to show simplified PrimeLedger process
- **Social Proof**: Adapt BigTime testimonials to generic professional services context
- **Pricing**: Reference BigTime's $10-30/user pricing to position PrimeLedger competitively

**Visual Asset Classification:**

**Content Images (MUST specify):**
- `imgs/logo.png` - PrimeLedger brand mark
- `imgs/feature-screenshots/` - Product interface screenshots
- `imgs/workflow-mockups/` - Process visualization diagrams  
- `imgs/client-logos/` - Professional service firm logos

**Decorative Images (NOT specified - handled in Design Spec):**
- Hero background patterns
- Section divider graphics
- Abstract geometric elements

## 4. Content Analysis

**Information Density:** Medium

- Research provides comprehensive competitive intelligence and feature specifications
- Clear pain points identified from user feedback
- Established workflow patterns from BigTime analysis

**Content Balance:**
- Images: 8 files (35%)
- Data/Charts: 0 files (0%)
- Text: 7,000 words (65%)

**Content Type:** Mixed (feature-focused with social proof)
