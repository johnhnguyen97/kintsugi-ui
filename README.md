# Kintsugi

> *Like the Japanese art of repairing pottery with gold, Kintsugi pieces together fragments into beautiful, cohesive components.*

An MCP server providing an **Atomic Design Engine** that transforms abstract component definitions into framework-specific implementations.

## Core Concepts

### Design Hierarchy

| Level | Name | Description | Examples |
|-------|------|-------------|----------|
| 1 | **Fragments** | Atomic building blocks | button, text, input, icon |
| 2 | **Compounds** | Fragment combinations | input-group, card-section, form-field |
| 3 | **Structures** | Complete components | dialog, data-grid, navbar, tabs |

### Blueprint DSL

Components are defined as abstract **Blueprints** - JSON specifications that describe the component's structure, variants, and styling:

```json
{
  "name": "PrimaryButton",
  "kind": "fragment",
  "base": "button",
  "variants": {
    "intent": ["primary", "secondary", "danger"],
    "size": ["sm", "md", "lg"]
  },
  "props": ["children", "onClick", "disabled", "loading"],
  "styles": {
    "base": "inline-flex items-center justify-center font-medium",
    "intent": {
      "primary": "bg-blue-600 text-white hover:bg-blue-700",
      "secondary": "bg-gray-100 text-gray-900 hover:bg-gray-200",
      "danger": "bg-red-600 text-white hover:bg-red-700"
    },
    "size": {
      "sm": "h-8 px-3 text-sm",
      "md": "h-10 px-4 text-sm",
      "lg": "h-12 px-6 text-base"
    }
  }
}
```

### Renderers

Blueprints compile to any target framework:

| Renderer | Stack | Features |
|----------|-------|----------|
| `react-tailwind` | React + Tailwind CSS | CVA variants, Tailwind Merge, forwardRef |
| `react-styled` | React + Emotion | CSS-in-JS, theme support |
| `react-vanilla` | React + CSS Modules | No runtime CSS |
| `vue-tailwind` | Vue 3 + Tailwind | Composition API |
| `solid-tailwind` | SolidJS + Tailwind | Signals, fine-grained reactivity |
| `html-tailwind` | Static HTML | Copy-paste ready |

### Essence (Design Tokens)

Universal design tokens that define your visual language:

```json
{
  "colors": { "primary": { "500": "#3b82f6", "600": "#2563eb" } },
  "spacing": { "sm": "0.5rem", "md": "1rem", "lg": "1.5rem" },
  "typography": { "sans": "Inter, system-ui, sans-serif" },
  "radii": { "sm": "0.125rem", "md": "0.375rem", "lg": "0.5rem" },
  "shadows": { "md": "0 4px 6px -1px rgb(0 0 0 / 0.1)" },
  "motion": { "fast": "150ms", "normal": "200ms" }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `forge` | Create components from blueprint specifications |
| `palette` | List available fragments, compounds, structures |
| `essence` | Get/set design tokens |
| `blueprint` | Get pre-defined component patterns |
| `render` | Compile blueprint JSON to target framework |
| `archive` | Save/retrieve custom blueprints |
| `renderers` | List available render targets and features |

## Installation

```bash
# Clone
git clone https://github.com/johnhnguyen97/kintsugi-ui.git
cd kintsugi-ui

# Install & Build
npm install
npm run build
```

## Configuration

### Claude Code

Add to `~/.claude/mcp_settings.json`:

```json
{
  "mcpServers": {
    "kintsugi": {
      "command": "node",
      "args": ["/path/to/kintsugi-ui/dist/index.js"],
      "env": {}
    }
  }
}
```

### Zed Editor

Add to Zed's `settings.json`:

```json
{
  "context_servers": {
    "kintsugi": {
      "source": "custom",
      "enabled": true,
      "command": "node",
      "args": ["/path/to/kintsugi-ui/dist/index.js"]
    }
  }
}
```

## Usage Examples

### Forge a Component

```
// Create a button with variants
forge(
  name: "PrimaryButton",
  kind: "fragment",
  base: "button",
  variants: { intent: ["primary", "danger"], size: ["sm", "lg"] },
  renderer: "react-tailwind"
)
```

### Get a Blueprint Pattern

```
// Get pre-built modal dialog pattern
blueprint(pattern: "modal-dialog")

// Get data table pattern
blueprint(pattern: "data-table")
```

### Render to Different Frameworks

```
// Same blueprint, different targets
render(blueprint: "{...}", renderer: "react-tailwind")
render(blueprint: "{...}", renderer: "vue-tailwind")
render(blueprint: "{...}", renderer: "solid-tailwind")
```

### Manage Design Tokens

```
// Get all tokens
essence(action: "get")

// Get specific category
essence(action: "get", category: "colors")

// Set custom tokens
essence(action: "set", tokens: '{"colors": {"brand": "#ff6b6b"}}')
```

### Archive Custom Blueprints

```
// Save for reuse
archive(action: "save", name: "my-button", blueprint: "{...}")

// List saved blueprints
archive(action: "list")

// Retrieve
archive(action: "get", name: "my-button")
```

## Available Patterns

Pre-defined blueprints for common components:

- `action-button` - Buttons with intent and size variants
- `text-input` - Form inputs with validation states
- `select-field` - Dropdown select with options
- `modal-dialog` - Modal/dialog with overlay
- `data-table` - Data grid with sorting
- `navigation-menu` - Dropdown navigation
- `card-container` - Card with header/body/footer
- `tab-panel` - Tabbed content
- `accordion-group` - Collapsible sections
- `alert-banner` - Alert/notification banners
- `avatar-badge` - Avatar with status badge
- `tooltip-trigger` - Tooltip on hover

## Project Structure

```
kintsugi-ui/
├── src/
│   └── index.ts          # MCP server + atomic design engine
├── data/
│   ├── essence.json      # Design tokens
│   └── archive/          # Saved blueprints
├── dist/                 # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

## Why "Kintsugi"?

Kintsugi (金継ぎ) is the Japanese art of repairing broken pottery with gold lacquer, treating breakage as part of the object's history rather than something to hide.

Similarly, this tool pieces together atomic fragments into beautiful, cohesive components - embracing the composition of smaller parts into a unified whole.

## License

MIT

---

*金継ぎ - The art of precious composition*
