# 🏺 Kintsugi-UI

> *Like the Japanese art of repairing pottery with gold, Kintsugi-UI pieces together different UI libraries into something beautiful.*

A Model Context Protocol (MCP) server that unifies component scaffolding across **shadcn/ui**, **MUI**, **Chakra UI**, and **Headless UI**.

## ✨ Features

- **Multi-Library Support** - Scaffold components in shadcn/ui, MUI, Chakra UI, or Headless UI style
- **Component Translation** - Convert components between library styles
- **Side-by-Side Comparison** - Compare how different libraries implement the same component
- **Design Tokens** - Universal tokens exportable to JSON, CSS, Tailwind, Chakra, or MUI format
- **Library Guides** - Setup, theming, patterns, and accessibility guides for each library
- **Component Storage** - Save and retrieve your custom components

## 🛠️ Tools

| Tool | Description |
|------|-------------|
| `list_components` | List components across all libraries |
| `get_component` | Retrieve a specific component |
| `save_component` | Save custom components |
| `scaffold_component` | Generate components in any library style |
| `translate_component` | Convert between library styles |
| `compare_libraries` | Side-by-side implementation comparison |
| `get_library_guide` | Setup, theming, patterns, accessibility |
| `get_design_tokens` | Universal design tokens |
| `get_install_command` | Install commands for npm/pnpm/yarn/bun |

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/johnhnguyen97/kintsugi-ui.git
cd kintsugi-ui

# Install dependencies
npm install

# Build
npm run build
```

## 🔧 Configuration

### Claude Code

Add to `~/.claude/mcp_settings.json`:

```json
{
  "mcpServers": {
    "kintsugi-ui": {
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
    "kintsugi-ui": {
      "source": "custom",
      "enabled": true,
      "command": "node",
      "args": ["/path/to/kintsugi-ui/dist/index.js"]
    }
  }
}
```

## 📖 Usage Examples

### Scaffold a Component

```
// shadcn/ui button with variants
scaffold_component(name: "PrimaryButton", library: "shadcn", componentType: "button")

// MUI modal dialog
scaffold_component(name: "ConfirmDialog", library: "mui", componentType: "modal")

// Chakra UI card
scaffold_component(name: "ProductCard", library: "chakra", componentType: "card")
```

### Compare Libraries

```
// See how each library implements a button
compare_libraries(componentType: "button")

// Compare specific libraries
compare_libraries(componentType: "modal", libraries: ["shadcn", "chakra"])
```

### Translate Components

```
// Convert MUI to Chakra style
translate_component(sourceLibrary: "mui", targetLibrary: "chakra", componentType: "card")
```

### Get Library Guide

```
// Full setup guide
get_library_guide(library: "shadcn", topic: "setup")

// Theming guide
get_library_guide(library: "chakra", topic: "theming")
```

### Design Tokens

```
// Get colors as CSS variables
get_design_tokens(tokenType: "colors", format: "css")

// Get spacing for Tailwind config
get_design_tokens(tokenType: "spacing", format: "tailwind")
```

## 🎨 Supported Libraries

| Library | Style Approach | Best For |
|---------|---------------|----------|
| **shadcn/ui** | Radix + Tailwind + cva | Full control, copy-paste components |
| **MUI** | Styled Components + sx prop | Material Design, enterprise apps |
| **Chakra UI** | Style props + colorScheme | Rapid prototyping, accessibility |
| **Headless UI** | Unstyled + Tailwind | Custom design systems |

## 🧩 Component Types

`button`, `input`, `select`, `modal`, `card`, `table`, `tabs`, `menu`, `alert`, `badge`, `avatar`, `tooltip`

## 📁 Project Structure

```
kintsugi-ui/
├── src/
│   └── index.ts          # MCP server with all tools
├── data/
│   ├── components/       # Stored component snippets
│   │   ├── shadcn/
│   │   ├── mui/
│   │   ├── chakra/
│   │   ├── headless/
│   │   └── custom/
│   ├── patterns/         # UI patterns
│   └── tokens/           # Design tokens
├── dist/                 # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

## 🤝 Contributing

Contributions welcome! Feel free to:
- Add new component patterns
- Improve library guides
- Add support for more UI libraries
- Fix bugs or improve documentation

## 📄 License

MIT

---

*金継ぎ (Kintsugi) - The art of precious scars*
