# SafeData Pipeline - Design Guidelines

## Design Approach: Enterprise Dashboard System

**Selected Approach**: Design System (Material Design + Enterprise Dashboard patterns)

**Justification**: This is a utility-focused, information-dense government application requiring professional credibility, efficient workflows, and data visualization clarity. Drawing from Material Design principles with inspiration from enterprise platforms like Salesforce, Linear, and modern SaaS dashboards.

**Core Principles**:
- Clarity over decoration: Every element serves a functional purpose
- Hierarchical information architecture with clear visual weight
- Predictable, consistent interaction patterns
- Data visualization prominence
- Government-grade professional aesthetics

---

## Typography Hierarchy

**Font Stack**: 
- Primary: Inter (Google Fonts) - Clean, professional, excellent readability
- Monospace: JetBrains Mono - For data tables, code, technical content

**Scale**:
- Page Titles: text-3xl font-bold (Government branding, module headers)
- Section Headers: text-2xl font-semibold 
- Card Titles: text-lg font-semibold
- Subsections: text-base font-medium
- Body Text: text-sm font-normal
- Helper Text: text-xs font-normal
- Data Tables: text-sm font-mono (numeric data)

---

## Layout System

**Spacing Primitives**: Use Tailwind units of **2, 4, 8, 12, 16**
- Micro spacing: p-2, gap-2 (between related elements)
- Standard spacing: p-4, gap-4 (card padding, form fields)
- Section spacing: p-8, gap-8 (between major sections)
- Large spacing: p-12, gap-12 (dashboard modules)
- Container spacing: p-16 (main content areas)

**Grid System**:
- Dashboard: 12-column responsive grid
- Sidebar: Fixed 64px (collapsed) / 256px (expanded)
- Main Content: Fluid with max-w-7xl container
- Cards: Grid 1/2/3 columns based on viewport (grid-cols-1 md:grid-cols-2 lg:grid-cols-3)

**Layout Structure**:
```
┌─────────────────────────────────────┐
│ Top Header (h-16)                   │
├──────┬──────────────────────────────┤
│      │ Breadcrumbs (h-12)          │
│ Side ├──────────────────────────────┤
│ bar  │                              │
│      │ Main Content Area            │
│      │ (p-8, max-w-7xl)            │
│      │                              │
└──────┴──────────────────────────────┘
```

---

## Component Library

### Navigation Components
**Sidebar Navigation**:
- Icons: Heroicons (outline for inactive, solid for active)
- Item height: h-12
- Icon size: w-6 h-6
- Hover state: Subtle background transition
- Active state: Border accent + icon transformation to solid

**Top Header**:
- Fixed height: h-16
- User avatar: rounded-full w-10 h-10
- Notification badge: Positioned absolute, rounded-full w-5 h-5
- Search bar: Expandable on focus, max-w-md

**Breadcrumbs**:
- Height: h-12
- Separator: "/" or chevron icon
- Last item: font-semibold (current page)

### Data Display Components

**Dashboard Cards**:
- Rounded corners: rounded-lg
- Shadow: shadow-sm hover:shadow-md transition
- Padding: p-6
- Header: flex justify-between items-center mb-4
- Stat value: text-3xl font-bold
- Stat label: text-sm font-medium
- Trend indicator: Icon + percentage change

**Data Tables**:
- Header: Sticky with border-b-2
- Row height: h-14 (adequate for readability)
- Cell padding: px-4 py-3
- Zebra striping: even:bg-slate-50
- Hover: Row highlight with subtle background
- Sort icons: Inline with headers, w-4 h-4
- Pagination: Bottom-aligned, showing "Showing X-Y of Z"

**Charts & Visualizations**:
- Card container: rounded-lg p-6
- Chart title: text-lg font-semibold mb-4
- Legend: Horizontal bottom-aligned or vertical right-aligned
- Axis labels: text-xs
- Tooltips: Rounded shadow-lg p-3 with arrow pointer
- Multiple data series: Use distinct visual patterns (solid, dashed, dotted lines)

### Form Components

**Input Fields**:
- Height: h-11
- Padding: px-4
- Border radius: rounded-md
- Border width: border-2 (increased for accessibility)
- Focus ring: ring-2 ring-offset-2
- Label: text-sm font-medium mb-2
- Helper text: text-xs mt-1
- Error state: Border emphasis + error text below

**Dropdowns & Multi-Select**:
- Trigger height: h-11
- Options list: max-h-60 overflow-auto
- Selected items (multi-select): Inline pills with remove button
- Search within: Input field at top of dropdown

**Sliders**:
- Track height: h-2
- Thumb size: w-5 h-5 rounded-full
- Value display: Inline label above thumb
- Range markers: Below track for reference values

**File Upload Dropzone**:
- Min height: h-48
- Dashed border: border-2 border-dashed
- Centered content: Vertical stack (icon, text, browse button)
- Drag-over state: Border emphasis + background tint
- Icon size: w-16 h-16

**Toggle Switches**:
- Width: w-11, height: h-6
- Pill shape: rounded-full
- Thumb: w-5 h-5 rounded-full with smooth translate transition

**Buttons**:
- Primary: h-11 px-6 rounded-md font-medium
- Secondary: Same size, border-2
- Icon-only: w-11 h-11 rounded-md (square for consistency)
- Icon + Text: gap-2 between icon and label
- Loading state: Icon spinner w-5 h-5

### Feedback Components

**Toast Notifications**:
- Position: Fixed top-right, stacked vertically with gap-3
- Width: w-96
- Padding: p-4
- Auto-dismiss: 5 seconds with progress bar
- Icon: Status-specific, w-6 h-6
- Close button: Absolute top-right

**Progress Indicators**:
- Linear bar: h-2 rounded-full, with animated fill
- Circular: Stroke-based SVG, text-center for percentage
- Indeterminate: Animated pulse or shimmer effect

**Modal Dialogs**:
- Overlay: Fixed inset-0 with backdrop blur
- Container: max-w-2xl centered with shadow-2xl
- Padding: p-8
- Header: text-2xl font-semibold mb-6
- Footer: Flex justify-end gap-3 (action buttons)

**Status Badges**:
- Height: h-6
- Padding: px-3
- Rounded: rounded-full
- Font: text-xs font-semibold uppercase tracking-wide
- Dot indicator: w-2 h-2 rounded-full inline with label

---

## Images

**Government Branding Header**:
- Government of India emblem: Top-left corner of login page and header
- Placement: w-12 h-12 in header, larger on login (w-20 h-20)
- Department logo: Ministry of Electronics and Information Technology seal

**Illustrations**:
- Login page: Isometric illustration of secure data flow/encryption (right side, 50% width)
- Empty states: Custom illustrations for "No data uploaded yet," "No assessments," etc. (w-48 centered)
- Error pages: 404/500 with friendly illustrations

**Dashboard Icons**: Use Heroicons library exclusively
- Outline variants for default state
- Solid variants for active navigation items

---

## Interaction Patterns

**Navigation Flow**:
- Sidebar collapse: Smooth width transition (300ms)
- Breadcrumb updates: Fade transition on route change
- Active state persistence: Visual indicator remains on current module

**Data Loading States**:
- Skeleton screens: Pulse animation for tables, cards during fetch
- Inline spinners: For button actions (upload, calculate, generate)
- Progress tracking: Step indicators for multi-step processes (Upload → Assess → Anonymize → Report)

**Form Validation**:
- Real-time: On blur for text inputs
- Submit-time: Block submission with visual feedback and scroll to first error
- Success confirmation: Toast notification + optional redirect

**Data Table Interactions**:
- Row selection: Checkbox column, with "Select All" header
- Bulk actions: Toolbar appears when rows selected
- Sorting: Click header, visual arrow indicator
- Filtering: Inline search + advanced filter drawer (slide from right)

**Chart Interactivity**:
- Tooltips: Show on hover with precise values
- Legend toggles: Click to show/hide data series
- Zoom/pan: For large datasets (optional, gesture-based)

---

## Responsive Breakpoints

- Mobile: Single column, collapsed sidebar (hamburger menu), stacked cards
- Tablet (md): 2-column grids, expandable sidebar
- Desktop (lg): Full layout with 3-column grids, persistent sidebar

**Mobile-Specific Adjustments**:
- Touch targets: Minimum h-12 for all interactive elements
- Bottom navigation: Fixed bar for primary actions
- Drawer patterns: Slide-up panels for filters, settings

---

## Accessibility

- Keyboard navigation: Tab order follows visual hierarchy
- ARIA labels: All icons, charts, and complex widgets
- Focus indicators: Visible ring-2 on all interactive elements
- Screen reader text: Hidden labels for icon-only buttons
- High contrast: Ensure 4.5:1 minimum ratio for all text