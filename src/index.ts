#!/usr/bin/env node
/**
 * Kintsugi - Atomic Design Engine
 *
 * A component compiler that transforms abstract component definitions
 * into framework-specific implementations. Like kintsugi pottery,
 * it pieces together fragments into beautiful, cohesive components.
 *
 * Core Concepts:
 * - Fragments: Atomic building blocks (button, text, container)
 * - Compounds: Combinations of fragments (input-group, card-section)
 * - Structures: Complete components (data-grid, dialog)
 * - Essence: Design tokens that define the visual language
 * - Renderers: Target frameworks (react-tailwind, react-styled, vue)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");

const server = new McpServer({
  name: "kintsugi",
  version: "1.0.0",
});

// ============================================================================
// CORE TYPES - Original Kintsugi DSL
// ============================================================================

// Fragment types - atomic building blocks
const FRAGMENT_TYPES = [
  "button", "text", "container", "input", "icon", "image", "link", "divider"
] as const;

// Compound types - combinations
const COMPOUND_TYPES = [
  "input-group", "button-group", "card-section", "nav-item", "list-item", "form-field"
] as const;

// Structure types - complete components
const STRUCTURE_TYPES = [
  "dialog", "drawer", "data-grid", "form", "card", "navbar", "sidebar", "dropdown", "tabs", "accordion"
] as const;

// Render targets
const RENDERERS = [
  "react-tailwind",    // React + Tailwind CSS
  "react-styled",      // React + CSS-in-JS
  "react-vanilla",     // React + plain CSS
  "vue-tailwind",      // Vue 3 + Tailwind
  "solid-tailwind",    // SolidJS + Tailwind
  "html-tailwind",     // Static HTML + Tailwind
] as const;

type FragmentType = typeof FRAGMENT_TYPES[number];
type CompoundType = typeof COMPOUND_TYPES[number];
type StructureType = typeof STRUCTURE_TYPES[number];
type Renderer = typeof RENDERERS[number];

// Component Blueprint - the abstract definition
interface Blueprint {
  name: string;
  kind: "fragment" | "compound" | "structure";
  base: string;
  variants?: Record<string, string[]>;
  styles?: Record<string, string | Record<string, string>>;
  props?: string[];
  slots?: string[];
  composition?: string[];
}

// ============================================================================
// TOOL: Forge - Create components from blueprints
// ============================================================================
server.tool(
  "forge",
  "Forge a new component from a blueprint specification. Define the component abstractly, then render it to any target framework.",
  {
    name: z.string().describe("Component name in PascalCase (e.g., 'PrimaryButton')"),
    kind: z.enum(["fragment", "compound", "structure"]).describe("Component complexity level"),
    base: z.string().describe("Base element type (e.g., 'button', 'input-group', 'dialog')"),
    variants: z.record(z.array(z.string())).optional().describe("Variant definitions (e.g., { intent: ['primary', 'danger'], size: ['sm', 'lg'] })"),
    props: z.array(z.string()).optional().describe("Additional props the component accepts"),
    renderer: z.enum(RENDERERS).describe("Target framework to render to"),
  },
  async ({ name, kind, base, variants, props, renderer }) => {
    const blueprint: Blueprint = { name, kind, base, variants, props };
    const component = renderBlueprint(blueprint, renderer);

    return {
      content: [{ type: "text", text: component }],
    };
  }
);

// ============================================================================
// TOOL: Palette - List available primitives
// ============================================================================
server.tool(
  "palette",
  "View the palette of available fragments, compounds, and structures that can be used as building blocks.",
  {
    category: z.enum(["all", "fragments", "compounds", "structures"]).optional().describe("Filter by category"),
  },
  async ({ category = "all" }) => {
    const palette: Record<string, string[]> = {};

    if (category === "all" || category === "fragments") {
      palette.fragments = [...FRAGMENT_TYPES];
    }
    if (category === "all" || category === "compounds") {
      palette.compounds = [...COMPOUND_TYPES];
    }
    if (category === "all" || category === "structures") {
      palette.structures = [...STRUCTURE_TYPES];
    }

    return {
      content: [{ type: "text", text: JSON.stringify(palette, null, 2) }],
    };
  }
);

// ============================================================================
// TOOL: Essence - Manage design tokens
// ============================================================================
server.tool(
  "essence",
  "Access or define the design essence (tokens) - colors, spacing, typography, shadows that define your visual language.",
  {
    action: z.enum(["get", "set"]).describe("Get or set essence tokens"),
    category: z.enum(["all", "colors", "spacing", "typography", "shadows", "radii", "motion"]).optional().describe("Token category"),
    tokens: z.string().optional().describe("JSON tokens to set (only for 'set' action)"),
  },
  async ({ action, category = "all", tokens }) => {
    const essencePath = path.join(DATA_DIR, "essence.json");

    if (action === "get") {
      try {
        const content = await fs.readFile(essencePath, "utf-8");
        const essence = JSON.parse(content);

        if (category === "all") {
          return { content: [{ type: "text", text: JSON.stringify(essence, null, 2) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(essence[category] || {}, null, 2) }] };
      } catch {
        return { content: [{ type: "text", text: JSON.stringify(getDefaultEssence(), null, 2) }] };
      }
    }

    // Set tokens
    if (!tokens) {
      return { content: [{ type: "text", text: "Error: tokens required for set action" }], isError: true };
    }

    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      let existing = {};
      try {
        existing = JSON.parse(await fs.readFile(essencePath, "utf-8"));
      } catch {}

      const newTokens = JSON.parse(tokens);
      const merged = { ...existing, ...newTokens };
      await fs.writeFile(essencePath, JSON.stringify(merged, null, 2));

      return { content: [{ type: "text", text: "Essence updated successfully" }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error}` }], isError: true };
    }
  }
);

// ============================================================================
// TOOL: Blueprint - Get component specification
// ============================================================================
server.tool(
  "blueprint",
  "Get a pre-defined blueprint for common component patterns. Use as a starting point for forging your own components.",
  {
    pattern: z.enum([
      "action-button", "text-input", "select-field", "modal-dialog",
      "data-table", "navigation-menu", "card-container", "tab-panel",
      "accordion-group", "alert-banner", "avatar-badge", "tooltip-trigger"
    ]).describe("Component pattern to get blueprint for"),
  },
  async ({ pattern }) => {
    const blueprint = getPatternBlueprint(pattern);
    return {
      content: [{ type: "text", text: JSON.stringify(blueprint, null, 2) }],
    };
  }
);

// ============================================================================
// TOOL: Render - Compile blueprint to target
// ============================================================================
server.tool(
  "render",
  "Render a complete component from a blueprint JSON specification to your target framework.",
  {
    blueprint: z.string().describe("Blueprint JSON specification"),
    renderer: z.enum(RENDERERS).describe("Target framework"),
    withTypes: z.boolean().optional().describe("Include TypeScript types (default: true)"),
    withDocs: z.boolean().optional().describe("Include JSDoc comments (default: true)"),
  },
  async ({ blueprint, renderer, withTypes = true, withDocs = true }) => {
    try {
      const bp: Blueprint = JSON.parse(blueprint);
      const component = renderBlueprint(bp, renderer, { withTypes, withDocs });
      return { content: [{ type: "text", text: component }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error parsing blueprint: ${error}` }], isError: true };
    }
  }
);

// ============================================================================
// TOOL: Archive - Save and retrieve custom blueprints
// ============================================================================
server.tool(
  "archive",
  "Save or retrieve custom component blueprints from your personal archive.",
  {
    action: z.enum(["save", "get", "list", "delete"]).describe("Archive action"),
    name: z.string().optional().describe("Blueprint name"),
    blueprint: z.string().optional().describe("Blueprint JSON to save"),
  },
  async ({ action, name, blueprint }) => {
    const archivePath = path.join(DATA_DIR, "archive");

    switch (action) {
      case "list": {
        try {
          await fs.mkdir(archivePath, { recursive: true });
          const files = await fs.readdir(archivePath);
          const blueprints = files.filter(f => f.endsWith(".json")).map(f => f.replace(".json", ""));
          return { content: [{ type: "text", text: JSON.stringify(blueprints, null, 2) }] };
        } catch {
          return { content: [{ type: "text", text: "[]" }] };
        }
      }

      case "get": {
        if (!name) return { content: [{ type: "text", text: "Error: name required" }], isError: true };
        try {
          const content = await fs.readFile(path.join(archivePath, `${name}.json`), "utf-8");
          return { content: [{ type: "text", text: content }] };
        } catch {
          return { content: [{ type: "text", text: `Blueprint not found: ${name}` }], isError: true };
        }
      }

      case "save": {
        if (!name || !blueprint) {
          return { content: [{ type: "text", text: "Error: name and blueprint required" }], isError: true };
        }
        try {
          await fs.mkdir(archivePath, { recursive: true });
          await fs.writeFile(path.join(archivePath, `${name}.json`), blueprint);
          return { content: [{ type: "text", text: `Saved: ${name}` }] };
        } catch (error) {
          return { content: [{ type: "text", text: `Error: ${error}` }], isError: true };
        }
      }

      case "delete": {
        if (!name) return { content: [{ type: "text", text: "Error: name required" }], isError: true };
        try {
          await fs.unlink(path.join(archivePath, `${name}.json`));
          return { content: [{ type: "text", text: `Deleted: ${name}` }] };
        } catch {
          return { content: [{ type: "text", text: `Blueprint not found: ${name}` }], isError: true };
        }
      }
    }
  }
);

// ============================================================================
// TOOL: Renderers - List available render targets
// ============================================================================
server.tool(
  "renderers",
  "List available render targets and their capabilities.",
  {},
  async () => {
    const info = {
      "react-tailwind": {
        description: "React components with Tailwind CSS utility classes",
        features: ["TypeScript", "Variants via CVA", "Tailwind Merge", "forwardRef support"],
        dependencies: ["react", "tailwindcss", "class-variance-authority", "tailwind-merge"],
      },
      "react-styled": {
        description: "React components with CSS-in-JS (styled-components/emotion)",
        features: ["TypeScript", "Theme support", "Dynamic props", "forwardRef support"],
        dependencies: ["react", "@emotion/react", "@emotion/styled"],
      },
      "react-vanilla": {
        description: "React components with plain CSS modules",
        features: ["TypeScript", "CSS Modules", "No runtime CSS"],
        dependencies: ["react"],
      },
      "vue-tailwind": {
        description: "Vue 3 components with Tailwind CSS",
        features: ["TypeScript", "Composition API", "Tailwind classes"],
        dependencies: ["vue", "tailwindcss"],
      },
      "solid-tailwind": {
        description: "SolidJS components with Tailwind CSS",
        features: ["TypeScript", "Signals", "Tailwind classes"],
        dependencies: ["solid-js", "tailwindcss"],
      },
      "html-tailwind": {
        description: "Static HTML with Tailwind CSS",
        features: ["No framework", "Copy-paste ready", "Tailwind classes"],
        dependencies: ["tailwindcss"],
      },
    };

    return {
      content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
    };
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDefaultEssence() {
  return {
    colors: {
      primary: { 50: "#eff6ff", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8" },
      neutral: { 50: "#fafafa", 100: "#f5f5f5", 200: "#e5e5e5", 500: "#737373", 800: "#262626", 900: "#171717" },
      success: { 500: "#22c55e", 600: "#16a34a" },
      warning: { 500: "#f59e0b", 600: "#d97706" },
      danger: { 500: "#ef4444", 600: "#dc2626" },
    },
    spacing: {
      xs: "0.25rem", sm: "0.5rem", md: "1rem", lg: "1.5rem", xl: "2rem", "2xl": "3rem",
    },
    typography: {
      sans: "Inter, system-ui, sans-serif",
      mono: "JetBrains Mono, monospace",
      sizes: { xs: "0.75rem", sm: "0.875rem", base: "1rem", lg: "1.125rem", xl: "1.25rem" },
    },
    radii: {
      none: "0", sm: "0.125rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem", full: "9999px",
    },
    shadows: {
      sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      md: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
      lg: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
    },
    motion: {
      fast: "150ms",
      normal: "200ms",
      slow: "300ms",
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    },
  };
}

function getPatternBlueprint(pattern: string): Blueprint {
  const blueprints: Record<string, Blueprint> = {
    "action-button": {
      name: "ActionButton",
      kind: "fragment",
      base: "button",
      variants: {
        intent: ["primary", "secondary", "danger", "ghost"],
        size: ["sm", "md", "lg"],
      },
      props: ["children", "onClick", "disabled", "loading", "icon"],
      styles: {
        base: "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
        intent: {
          primary: "bg-primary-600 text-white hover:bg-primary-700",
          secondary: "bg-neutral-100 text-neutral-900 hover:bg-neutral-200",
          danger: "bg-danger-600 text-white hover:bg-danger-700",
          ghost: "hover:bg-neutral-100",
        },
        size: {
          sm: "h-8 px-3 text-sm rounded-md",
          md: "h-10 px-4 text-sm rounded-md",
          lg: "h-12 px-6 text-base rounded-lg",
        },
      },
    },
    "text-input": {
      name: "TextInput",
      kind: "compound",
      base: "input-group",
      variants: {
        size: ["sm", "md", "lg"],
        state: ["default", "error", "success"],
      },
      props: ["label", "placeholder", "value", "onChange", "error", "hint", "required", "disabled"],
      styles: {
        base: "flex flex-col gap-1.5",
        input: "w-full rounded-md border bg-white px-3 transition-colors focus:outline-none focus:ring-2",
        state: {
          default: "border-neutral-200 focus:border-primary-500 focus:ring-primary-500/20",
          error: "border-danger-500 focus:border-danger-500 focus:ring-danger-500/20",
          success: "border-success-500 focus:border-success-500 focus:ring-success-500/20",
        },
        size: {
          sm: "h-8 text-sm",
          md: "h-10 text-sm",
          lg: "h-12 text-base",
        },
      },
    },
    "select-field": {
      name: "SelectField",
      kind: "compound",
      base: "input-group",
      variants: {
        size: ["sm", "md", "lg"],
      },
      props: ["label", "options", "value", "onChange", "placeholder", "error", "disabled"],
      styles: {
        base: "flex flex-col gap-1.5",
        trigger: "w-full rounded-md border bg-white px-3 flex items-center justify-between",
        content: "absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg",
        item: "px-3 py-2 cursor-pointer hover:bg-neutral-100",
      },
    },
    "modal-dialog": {
      name: "ModalDialog",
      kind: "structure",
      base: "dialog",
      variants: {
        size: ["sm", "md", "lg", "xl", "full"],
      },
      props: ["open", "onClose", "title", "description", "children", "footer"],
      slots: ["header", "body", "footer"],
      styles: {
        overlay: "fixed inset-0 bg-black/50 backdrop-blur-sm",
        content: "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl",
        size: {
          sm: "w-full max-w-sm",
          md: "w-full max-w-md",
          lg: "w-full max-w-lg",
          xl: "w-full max-w-xl",
          full: "w-full max-w-4xl",
        },
      },
    },
    "data-table": {
      name: "DataTable",
      kind: "structure",
      base: "data-grid",
      variants: {
        density: ["compact", "normal", "comfortable"],
      },
      props: ["columns", "data", "keyField", "selectable", "sortable", "onRowClick", "emptyMessage"],
      styles: {
        container: "overflow-auto rounded-lg border",
        table: "min-w-full divide-y",
        header: "bg-neutral-50",
        headerCell: "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider",
        row: "border-b transition-colors hover:bg-neutral-50",
        cell: "px-4 py-3 text-sm",
      },
    },
    "navigation-menu": {
      name: "NavigationMenu",
      kind: "structure",
      base: "dropdown",
      props: ["items", "trigger", "align"],
      styles: {
        trigger: "inline-flex items-center gap-1",
        content: "absolute z-50 min-w-[12rem] rounded-md border bg-white p-1 shadow-lg",
        item: "flex items-center rounded-sm px-3 py-2 text-sm transition-colors hover:bg-neutral-100",
        separator: "my-1 h-px bg-neutral-200",
      },
    },
    "card-container": {
      name: "CardContainer",
      kind: "structure",
      base: "card",
      variants: {
        variant: ["elevated", "outlined", "filled"],
        padding: ["none", "sm", "md", "lg"],
      },
      props: ["children", "header", "footer", "onClick"],
      slots: ["header", "body", "footer"],
      styles: {
        base: "rounded-lg overflow-hidden",
        variant: {
          elevated: "bg-white shadow-md",
          outlined: "bg-white border border-neutral-200",
          filled: "bg-neutral-50",
        },
        padding: {
          none: "",
          sm: "p-3",
          md: "p-4",
          lg: "p-6",
        },
      },
    },
    "tab-panel": {
      name: "TabPanel",
      kind: "structure",
      base: "tabs",
      props: ["tabs", "defaultValue", "onChange"],
      styles: {
        list: "flex border-b",
        trigger: "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
        triggerActive: "border-primary-500 text-primary-600",
        triggerInactive: "border-transparent text-neutral-500 hover:text-neutral-700",
        content: "py-4",
      },
    },
    "accordion-group": {
      name: "AccordionGroup",
      kind: "structure",
      base: "accordion",
      props: ["items", "type", "defaultValue"],
      styles: {
        item: "border-b",
        trigger: "flex w-full items-center justify-between py-4 text-left font-medium transition-colors hover:text-primary-600",
        content: "overflow-hidden transition-all",
        icon: "h-4 w-4 transition-transform",
      },
    },
    "alert-banner": {
      name: "AlertBanner",
      kind: "compound",
      base: "container",
      variants: {
        intent: ["info", "success", "warning", "danger"],
      },
      props: ["title", "children", "onClose", "icon"],
      styles: {
        base: "relative rounded-lg border p-4",
        intent: {
          info: "bg-primary-50 border-primary-200 text-primary-800",
          success: "bg-success-50 border-success-200 text-success-800",
          warning: "bg-warning-50 border-warning-200 text-warning-800",
          danger: "bg-danger-50 border-danger-200 text-danger-800",
        },
      },
    },
    "avatar-badge": {
      name: "AvatarBadge",
      kind: "fragment",
      base: "image",
      variants: {
        size: ["xs", "sm", "md", "lg", "xl"],
        shape: ["circle", "square"],
      },
      props: ["src", "alt", "fallback", "badge"],
      styles: {
        base: "relative inline-flex shrink-0 overflow-hidden",
        shape: {
          circle: "rounded-full",
          square: "rounded-md",
        },
        size: {
          xs: "h-6 w-6",
          sm: "h-8 w-8",
          md: "h-10 w-10",
          lg: "h-12 w-12",
          xl: "h-16 w-16",
        },
        fallback: "flex h-full w-full items-center justify-center bg-neutral-200 text-neutral-600",
        badge: "absolute bottom-0 right-0 block rounded-full ring-2 ring-white",
      },
    },
    "tooltip-trigger": {
      name: "TooltipTrigger",
      kind: "compound",
      base: "container",
      variants: {
        side: ["top", "right", "bottom", "left"],
      },
      props: ["content", "children", "delay"],
      styles: {
        content: "z-50 rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white shadow-md animate-in fade-in-0",
        arrow: "fill-neutral-900",
      },
    },
  };

  return blueprints[pattern] || blueprints["action-button"];
}

function renderBlueprint(
  blueprint: Blueprint,
  renderer: Renderer,
  options: { withTypes?: boolean; withDocs?: boolean } = {}
): string {
  const { withTypes = true, withDocs = true } = options;

  switch (renderer) {
    case "react-tailwind":
      return renderReactTailwind(blueprint, withTypes, withDocs);
    case "react-styled":
      return renderReactStyled(blueprint, withTypes, withDocs);
    case "react-vanilla":
      return renderReactVanilla(blueprint, withTypes, withDocs);
    case "vue-tailwind":
      return renderVueTailwind(blueprint, withDocs);
    case "solid-tailwind":
      return renderSolidTailwind(blueprint, withTypes, withDocs);
    case "html-tailwind":
      return renderHtmlTailwind(blueprint);
    default:
      return renderReactTailwind(blueprint, withTypes, withDocs);
  }
}

function renderReactTailwind(blueprint: Blueprint, withTypes: boolean, withDocs: boolean): string {
  const { name, variants, props = [], styles } = blueprint;
  const hasVariants = variants && Object.keys(variants).length > 0;

  let code = "";

  // Imports
  code += `import * as React from "react";\n`;
  if (hasVariants) {
    code += `import { cva, type VariantProps } from "class-variance-authority";\n`;
  }
  code += `import { cn } from "@/lib/utils";\n\n`;

  // Variants
  if (hasVariants) {
    code += `const ${name.toLowerCase()}Variants = cva(\n`;
    code += `  "${styles?.base || ""}",\n`;
    code += `  {\n`;
    code += `    variants: {\n`;

    for (const [variantName, variantValues] of Object.entries(variants)) {
      const variantStyles = styles?.[variantName] as Record<string, string> | undefined;
      code += `      ${variantName}: {\n`;
      for (const value of variantValues) {
        code += `        ${value}: "${variantStyles?.[value] || ""}",\n`;
      }
      code += `      },\n`;
    }

    code += `    },\n`;
    code += `    defaultVariants: {\n`;
    for (const [variantName, variantValues] of Object.entries(variants)) {
      code += `      ${variantName}: "${variantValues[0]}",\n`;
    }
    code += `    },\n`;
    code += `  }\n`;
    code += `);\n\n`;
  }

  // Types
  if (withTypes) {
    const baseElement = getBaseElement(blueprint.base);
    code += `interface ${name}Props\n`;
    code += `  extends React.ComponentPropsWithoutRef<"${baseElement}">`;
    if (hasVariants) {
      code += `,\n    VariantProps<typeof ${name.toLowerCase()}Variants>`;
    }
    code += ` {\n`;
    for (const prop of props) {
      if (!["children", "onClick", "disabled", "className"].includes(prop)) {
        code += `  ${prop}?: ${getPropType(prop)};\n`;
      }
    }
    code += `}\n\n`;
  }

  // JSDoc
  if (withDocs) {
    code += `/**\n`;
    code += ` * ${name} component\n`;
    code += ` * @description A ${blueprint.kind} component built with Kintsugi Design Engine\n`;
    if (hasVariants) {
      for (const [variantName, variantValues] of Object.entries(variants)) {
        code += ` * @param ${variantName} - ${variantValues.join(" | ")}\n`;
      }
    }
    code += ` */\n`;
  }

  // Component
  const baseEl = getBaseElement(blueprint.base);
  const elementType = getHtmlElementType(baseEl);
  code += `export const ${name} = React.forwardRef<\n`;
  code += `  ${elementType},\n`;
  code += `  ${name}Props\n`;
  code += `>(\n`;

  const variantProps = hasVariants ? Object.keys(variants).join(", ") + ", " : "";
  code += `  ({ ${variantProps}className, children, ...props }, ref) => {\n`;
  code += `    return (\n`;
  code += `      <${getBaseElement(blueprint.base)}\n`;
  code += `        ref={ref}\n`;
  code += `        className={cn(${hasVariants ? `${name.toLowerCase()}Variants({ ${Object.keys(variants).join(", ")} })` : `"${styles?.base || ""}"`}, className)}\n`;
  code += `        {...props}\n`;
  code += `      >\n`;
  code += `        {children}\n`;
  code += `      </${getBaseElement(blueprint.base)}>\n`;
  code += `    );\n`;
  code += `  }\n`;
  code += `);\n\n`;

  code += `${name}.displayName = "${name}";\n`;

  return code;
}

function renderReactStyled(blueprint: Blueprint, withTypes: boolean, withDocs: boolean): string {
  const { name, variants, props = [], styles } = blueprint;
  const hasVariants = variants && Object.keys(variants).length > 0;

  let code = "";

  code += `import * as React from "react";\n`;
  code += `import styled from "@emotion/styled";\n\n`;

  // Styled component
  const baseElement = getBaseElement(blueprint.base);
  code += `const Styled${name} = styled.${baseElement}\`\n`;

  // Base styles (convert Tailwind to CSS-like)
  code += `  display: inline-flex;\n`;
  code += `  align-items: center;\n`;
  code += `  justify-content: center;\n`;
  code += `  transition: all 0.2s ease;\n`;
  code += `  cursor: pointer;\n`;
  code += `  \n`;
  code += `  &:disabled {\n`;
  code += `    opacity: 0.5;\n`;
  code += `    pointer-events: none;\n`;
  code += `  }\n`;
  code += `\`;\n\n`;

  // Types
  if (withTypes) {
    code += `interface ${name}Props extends React.ComponentPropsWithoutRef<"${baseElement}"> {\n`;
    if (hasVariants) {
      for (const [variantName, variantValues] of Object.entries(variants)) {
        code += `  ${variantName}?: ${variantValues.map(v => `"${v}"`).join(" | ")};\n`;
      }
    }
    for (const prop of props) {
      if (!["children", "onClick", "disabled", "className"].includes(prop)) {
        code += `  ${prop}?: ${getPropType(prop)};\n`;
      }
    }
    code += `}\n\n`;
  }

  // Component
  code += `export const ${name} = React.forwardRef<\n`;
  code += `  HTML${baseElement.charAt(0).toUpperCase() + baseElement.slice(1)}Element,\n`;
  code += `  ${name}Props\n`;
  code += `>(({ children, ...props }, ref) => {\n`;
  code += `  return (\n`;
  code += `    <Styled${name} ref={ref} {...props}>\n`;
  code += `      {children}\n`;
  code += `    </Styled${name}>\n`;
  code += `  );\n`;
  code += `});\n\n`;

  code += `${name}.displayName = "${name}";\n`;

  return code;
}

function renderReactVanilla(blueprint: Blueprint, withTypes: boolean, withDocs: boolean): string {
  const { name, variants, props = [] } = blueprint;
  const hasVariants = variants && Object.keys(variants).length > 0;
  const baseElement = getBaseElement(blueprint.base);

  let code = "";

  code += `import * as React from "react";\n`;
  code += `import styles from "./${name}.module.css";\n\n`;

  // Types
  if (withTypes) {
    code += `interface ${name}Props extends React.ComponentPropsWithoutRef<"${baseElement}"> {\n`;
    if (hasVariants) {
      for (const [variantName, variantValues] of Object.entries(variants)) {
        code += `  ${variantName}?: ${variantValues.map(v => `"${v}"`).join(" | ")};\n`;
      }
    }
    for (const prop of props) {
      if (!["children", "onClick", "disabled", "className"].includes(prop)) {
        code += `  ${prop}?: ${getPropType(prop)};\n`;
      }
    }
    code += `}\n\n`;
  }

  // Component
  const variantProps = hasVariants ? Object.keys(variants).join(", ") + ", " : "";
  code += `export const ${name} = React.forwardRef<\n`;
  code += `  HTML${baseElement.charAt(0).toUpperCase() + baseElement.slice(1)}Element,\n`;
  code += `  ${name}Props\n`;
  code += `>(({ ${variantProps}className, children, ...props }, ref) => {\n`;

  if (hasVariants) {
    code += `  const classNames = [\n`;
    code += `    styles.base,\n`;
    for (const variantName of Object.keys(variants)) {
      code += `    ${variantName} && styles[${variantName}],\n`;
    }
    code += `    className,\n`;
    code += `  ].filter(Boolean).join(" ");\n\n`;
  }

  code += `  return (\n`;
  code += `    <${baseElement}\n`;
  code += `      ref={ref}\n`;
  code += `      className={${hasVariants ? "classNames" : "className"}}\n`;
  code += `      {...props}\n`;
  code += `    >\n`;
  code += `      {children}\n`;
  code += `    </${baseElement}>\n`;
  code += `  );\n`;
  code += `});\n\n`;

  code += `${name}.displayName = "${name}";\n`;

  return code;
}

function renderVueTailwind(blueprint: Blueprint, withDocs: boolean): string {
  const { name, variants, props = [], styles } = blueprint;
  const hasVariants = variants && Object.keys(variants).length > 0;
  const baseElement = getBaseElement(blueprint.base);

  let code = "";

  code += `<script setup lang="ts">\n`;

  // Props
  if (hasVariants || props.length > 0) {
    code += `interface Props {\n`;
    if (hasVariants) {
      for (const [variantName, variantValues] of Object.entries(variants)) {
        code += `  ${variantName}?: ${variantValues.map(v => `"${v}"`).join(" | ")};\n`;
      }
    }
    for (const prop of props) {
      if (!["children", "onClick", "disabled", "className"].includes(prop)) {
        code += `  ${prop}?: ${getPropType(prop)};\n`;
      }
    }
    code += `}\n\n`;

    code += `const props = withDefaults(defineProps<Props>(), {\n`;
    if (hasVariants) {
      for (const [variantName, variantValues] of Object.entries(variants)) {
        code += `  ${variantName}: "${variantValues[0]}",\n`;
      }
    }
    code += `});\n`;
  }

  code += `</script>\n\n`;

  code += `<template>\n`;
  code += `  <${baseElement}\n`;
  code += `    class="${styles?.base || ""}"\n`;
  code += `  >\n`;
  code += `    <slot />\n`;
  code += `  </${baseElement}>\n`;
  code += `</template>\n`;

  return code;
}

function renderSolidTailwind(blueprint: Blueprint, withTypes: boolean, withDocs: boolean): string {
  const { name, variants, props = [], styles } = blueprint;
  const hasVariants = variants && Object.keys(variants).length > 0;
  const baseElement = getBaseElement(blueprint.base);

  let code = "";

  code += `import { Component, JSX, splitProps } from "solid-js";\n\n`;

  // Types
  if (withTypes) {
    code += `interface ${name}Props extends JSX.HTMLAttributes<HTML${baseElement.charAt(0).toUpperCase() + baseElement.slice(1)}Element> {\n`;
    if (hasVariants) {
      for (const [variantName, variantValues] of Object.entries(variants)) {
        code += `  ${variantName}?: ${variantValues.map(v => `"${v}"`).join(" | ")};\n`;
      }
    }
    for (const prop of props) {
      if (!["children", "onClick", "disabled", "className"].includes(prop)) {
        code += `  ${prop}?: ${getPropType(prop)};\n`;
      }
    }
    code += `}\n\n`;
  }

  // Component
  const variantKeys = hasVariants ? Object.keys(variants) : [];
  code += `export const ${name}: Component<${name}Props> = (props) => {\n`;
  code += `  const [local, others] = splitProps(props, [${variantKeys.map(k => `"${k}"`).join(", ")}${variantKeys.length ? ", " : ""}"class", "children"]);\n\n`;
  code += `  return (\n`;
  code += `    <${baseElement}\n`;
  code += `      class={"${styles?.base || ""}"}\n`;
  code += `      {...others}\n`;
  code += `    >\n`;
  code += `      {local.children}\n`;
  code += `    </${baseElement}>\n`;
  code += `  );\n`;
  code += `};\n`;

  return code;
}

function renderHtmlTailwind(blueprint: Blueprint): string {
  const { name, variants, styles } = blueprint;
  const hasVariants = variants && Object.keys(variants).length > 0;
  const baseElement = getBaseElement(blueprint.base);

  let code = `<!-- ${name} Component -->\n\n`;

  // Base component
  code += `<!-- Default -->\n`;
  code += `<${baseElement} class="${styles?.base || ""}">\n`;
  code += `  Content\n`;
  code += `</${baseElement}>\n\n`;

  // Variant examples
  if (hasVariants && styles) {
    for (const [variantName, variantValues] of Object.entries(variants)) {
      const variantStyles = styles[variantName] as Record<string, string> | undefined;
      if (variantStyles) {
        code += `<!-- ${variantName} variants -->\n`;
        for (const value of variantValues) {
          code += `<${baseElement} class="${styles.base || ""} ${variantStyles[value] || ""}">\n`;
          code += `  ${value}\n`;
          code += `</${baseElement}>\n`;
        }
        code += `\n`;
      }
    }
  }

  return code;
}

function getHtmlElementType(element: string): string {
  const typeMap: Record<string, string> = {
    button: "HTMLButtonElement",
    input: "HTMLInputElement",
    a: "HTMLAnchorElement",
    img: "HTMLImageElement",
    table: "HTMLTableElement",
    form: "HTMLFormElement",
    nav: "HTMLElement",
    aside: "HTMLElement",
    div: "HTMLDivElement",
    span: "HTMLSpanElement",
    hr: "HTMLHRElement",
    svg: "SVGSVGElement",
    li: "HTMLLIElement",
  };
  return typeMap[element] || "HTMLDivElement";
}

function getBaseElement(base: string): string {
  const elementMap: Record<string, string> = {
    button: "button",
    text: "span",
    container: "div",
    input: "input",
    icon: "svg",
    image: "img",
    link: "a",
    divider: "hr",
    "input-group": "div",
    "button-group": "div",
    "card-section": "div",
    "nav-item": "a",
    "list-item": "li",
    "form-field": "div",
    dialog: "div",
    drawer: "div",
    "data-grid": "table",
    form: "form",
    card: "div",
    navbar: "nav",
    sidebar: "aside",
    dropdown: "div",
    tabs: "div",
    accordion: "div",
  };

  return elementMap[base] || "div";
}

function getPropType(prop: string): string {
  const typeMap: Record<string, string> = {
    label: "string",
    placeholder: "string",
    value: "string",
    error: "string",
    hint: "string",
    title: "string",
    description: "string",
    src: "string",
    alt: "string",
    fallback: "string",
    content: "React.ReactNode",
    icon: "React.ReactNode",
    badge: "React.ReactNode",
    header: "React.ReactNode",
    footer: "React.ReactNode",
    loading: "boolean",
    required: "boolean",
    open: "boolean",
    onChange: "(value: string) => void",
    onClose: "() => void",
    options: "Array<{ value: string; label: string }>",
    items: "Array<{ label: string; value: string }>",
    columns: "Array<{ key: string; header: string }>",
    data: "Array<Record<string, unknown>>",
    tabs: "Array<{ label: string; content: React.ReactNode }>",
    delay: "number",
  };

  return typeMap[prop] || "unknown";
}

// ============================================================================
// Start Server
// ============================================================================
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Kintsugi Atomic Design Engine running on stdio");
}

main().catch(console.error);
