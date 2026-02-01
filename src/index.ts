#!/usr/bin/env node
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
  name: "unified-components",
  version: "2.0.0",
});

// Supported UI libraries
const LIBRARIES = ["shadcn", "mui", "chakra", "headless", "custom"] as const;
type Library = (typeof LIBRARIES)[number];

// Component categories
const CATEGORIES = ["forms", "tables", "modals", "navigation", "feedback", "layout", "data-display"] as const;
type Category = (typeof CATEGORIES)[number];

// ============================================================================
// TOOL: List Components
// ============================================================================
server.tool(
  "list_components",
  "List all available component snippets across all UI libraries. Filter by library (shadcn, mui, chakra, headless, custom) or category.",
  {
    library: z.enum(["all", ...LIBRARIES]).optional().describe("Filter by UI library"),
    category: z.enum(["all", ...CATEGORIES]).optional().describe("Filter by category"),
  },
  async ({ library = "all", category = "all" }) => {
    try {
      const result: Record<string, Record<string, string[]>> = {};

      const libs = library === "all" ? [...LIBRARIES] : [library as Library];

      for (const lib of libs) {
        const libDir = path.join(DATA_DIR, "components", lib);
        const categories = await fs.readdir(libDir).catch(() => []);

        if (categories.length === 0) continue;

        result[lib] = {};

        for (const cat of categories) {
          if (category !== "all" && cat !== category) continue;

          const catPath = path.join(libDir, cat);
          const stat = await fs.stat(catPath).catch(() => null);
          if (!stat?.isDirectory()) continue;

          const files = await fs.readdir(catPath).catch(() => []);
          const components = files.filter((f) => f.endsWith(".tsx")).map((f) => f.replace(".tsx", ""));
          if (components.length > 0) {
            result[lib][cat] = components;
          }
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error listing components: ${error}` }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: Get Component
// ============================================================================
server.tool(
  "get_component",
  "Retrieve a specific component from any UI library. Supports shadcn/ui, MUI, Chakra UI, Headless UI, and custom components.",
  {
    library: z.enum(LIBRARIES).describe("UI library (shadcn, mui, chakra, headless, custom)"),
    category: z.enum([...CATEGORIES]).describe("Component category"),
    name: z.string().describe("Component name (e.g., 'Button', 'DataTable', 'Modal')"),
  },
  async ({ library, category, name }) => {
    try {
      const componentPath = path.join(DATA_DIR, "components", library, category, `${name}.tsx`);
      const content = await fs.readFile(componentPath, "utf-8");

      return {
        content: [{ type: "text", text: content }],
      };
    } catch (error) {
      // Try to return inline component if file doesn't exist
      const inline = getInlineComponent(library, category, name);
      if (inline) {
        return { content: [{ type: "text", text: inline }] };
      }
      return {
        content: [{ type: "text", text: `Component not found: ${library}/${category}/${name}` }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: Save Component
// ============================================================================
server.tool(
  "save_component",
  "Save a component snippet to the library for future reuse.",
  {
    library: z.enum(LIBRARIES).describe("UI library to save under"),
    category: z.enum([...CATEGORIES]).describe("Component category"),
    name: z.string().describe("Component name (PascalCase, e.g., 'DataTable')"),
    code: z.string().describe("Full component code with imports"),
    description: z.string().optional().describe("Brief description of the component"),
  },
  async ({ library, category, name, code, description }) => {
    try {
      const categoryDir = path.join(DATA_DIR, "components", library, category);
      await fs.mkdir(categoryDir, { recursive: true });

      const header = description ? `/**\n * ${description}\n * @library ${library}\n * @category ${category}\n */\n\n` : "";

      const componentPath = path.join(categoryDir, `${name}.tsx`);
      await fs.writeFile(componentPath, header + code);

      return {
        content: [{ type: "text", text: `Saved: ${library}/${category}/${name}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error saving component: ${error}` }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: Scaffold Component (Multi-Library)
// ============================================================================
server.tool(
  "scaffold_component",
  "Generate a new component in your preferred UI library style. Supports shadcn/ui, MUI, Chakra UI, or Headless UI patterns.",
  {
    name: z.string().describe("Component name in PascalCase (e.g., 'UserProfile')"),
    library: z.enum(LIBRARIES).describe("Target UI library style"),
    componentType: z
      .enum(["button", "input", "select", "modal", "card", "table", "tabs", "menu", "alert", "badge", "avatar", "tooltip"])
      .describe("Type of component to scaffold"),
    props: z
      .array(
        z.object({
          name: z.string(),
          type: z.string(),
          required: z.boolean().optional(),
          defaultValue: z.string().optional(),
        })
      )
      .optional()
      .describe("Additional custom props"),
    withVariants: z.boolean().optional().describe("Include variant system (shadcn: cva, others: native)"),
  },
  async ({ name, library, componentType, props = [], withVariants = true }) => {
    const component = scaffoldMultiLibraryComponent(name, library, componentType, props, withVariants);

    return {
      content: [{ type: "text", text: component }],
    };
  }
);

// ============================================================================
// TOOL: Translate Component
// ============================================================================
server.tool(
  "translate_component",
  "Convert a component from one UI library style to another. Useful for migrating between libraries or comparing implementations.",
  {
    sourceLibrary: z.enum(LIBRARIES).describe("Source UI library"),
    targetLibrary: z.enum(LIBRARIES).describe("Target UI library"),
    componentType: z
      .enum(["button", "input", "select", "modal", "card", "table", "tabs", "menu", "alert"])
      .describe("Type of component"),
    sourceCode: z.string().optional().describe("Source code to translate (if not provided, uses template)"),
  },
  async ({ sourceLibrary, targetLibrary, componentType, sourceCode }) => {
    // Get the target library's version of the component
    const translated = scaffoldMultiLibraryComponent(
      componentType.charAt(0).toUpperCase() + componentType.slice(1),
      targetLibrary,
      componentType,
      [],
      true
    );

    const explanation = `// Translated from ${sourceLibrary} to ${targetLibrary}\n// Key differences:\n${getLibraryDifferences(sourceLibrary, targetLibrary)}\n\n`;

    return {
      content: [{ type: "text", text: explanation + translated }],
    };
  }
);

// ============================================================================
// TOOL: Get Library Guide
// ============================================================================
server.tool(
  "get_library_guide",
  "Get a quick reference guide for a specific UI library including setup, conventions, and best practices.",
  {
    library: z.enum(LIBRARIES).describe("UI library to get guide for"),
    topic: z
      .enum(["setup", "theming", "patterns", "accessibility", "all"])
      .optional()
      .describe("Specific topic or 'all'"),
  },
  async ({ library, topic = "all" }) => {
    const guide = getLibraryGuide(library, topic);
    return {
      content: [{ type: "text", text: guide }],
    };
  }
);

// ============================================================================
// TOOL: Compare Libraries
// ============================================================================
server.tool(
  "compare_libraries",
  "Compare how different UI libraries implement the same component. Useful for choosing a library or understanding trade-offs.",
  {
    componentType: z
      .enum(["button", "input", "select", "modal", "card", "tabs", "menu"])
      .describe("Component type to compare"),
    libraries: z.array(z.enum(LIBRARIES)).optional().describe("Libraries to compare (default: all)"),
  },
  async ({ componentType, libraries = [...LIBRARIES] }) => {
    const comparisons: Record<string, string> = {};

    for (const lib of libraries) {
      comparisons[lib] = scaffoldMultiLibraryComponent(
        componentType.charAt(0).toUpperCase() + componentType.slice(1),
        lib,
        componentType,
        [],
        true
      );
    }

    let output = `# ${componentType.charAt(0).toUpperCase() + componentType.slice(1)} Component Comparison\n\n`;

    for (const [lib, code] of Object.entries(comparisons)) {
      output += `## ${lib.toUpperCase()}\n\`\`\`tsx\n${code}\n\`\`\`\n\n`;
    }

    return {
      content: [{ type: "text", text: output }],
    };
  }
);

// ============================================================================
// TOOL: Get Design Tokens
// ============================================================================
server.tool(
  "get_design_tokens",
  "Get design tokens (colors, spacing, typography) that work across all UI libraries.",
  {
    tokenType: z
      .enum(["all", "colors", "spacing", "typography", "shadows", "breakpoints", "animations"])
      .optional()
      .describe("Specific token type"),
    format: z.enum(["json", "css", "tailwind", "chakra", "mui"]).optional().describe("Output format"),
  },
  async ({ tokenType = "all", format = "json" }) => {
    try {
      const tokensPath = path.join(DATA_DIR, "tokens", "design-tokens.json");
      const content = await fs.readFile(tokensPath, "utf-8");
      const tokens = JSON.parse(content);

      const selectedTokens = tokenType === "all" ? tokens : tokens[tokenType] || {};

      if (format === "json") {
        return { content: [{ type: "text", text: JSON.stringify(selectedTokens, null, 2) }] };
      }

      const formatted = formatTokens(selectedTokens, format, tokenType);
      return { content: [{ type: "text", text: formatted }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error reading design tokens: ${error}` }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// TOOL: Get Install Command
// ============================================================================
server.tool(
  "get_install_command",
  "Get the installation commands and dependencies for a UI library.",
  {
    library: z.enum(LIBRARIES).describe("UI library"),
    packageManager: z.enum(["npm", "pnpm", "yarn", "bun"]).optional().describe("Package manager"),
  },
  async ({ library, packageManager = "npm" }) => {
    const installs = getInstallCommands(library, packageManager);
    return {
      content: [{ type: "text", text: installs }],
    };
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

function scaffoldMultiLibraryComponent(
  name: string,
  library: Library,
  componentType: string,
  props: Array<{ name: string; type: string; required?: boolean; defaultValue?: string }>,
  withVariants: boolean
): string {
  switch (library) {
    case "shadcn":
      return scaffoldShadcnComponent(name, componentType, props, withVariants);
    case "mui":
      return scaffoldMuiComponent(name, componentType, props);
    case "chakra":
      return scaffoldChakraComponent(name, componentType, props);
    case "headless":
      return scaffoldHeadlessComponent(name, componentType, props);
    default:
      return scaffoldCustomComponent(name, componentType, props, withVariants);
  }
}

function scaffoldShadcnComponent(
  name: string,
  componentType: string,
  props: Array<{ name: string; type: string; required?: boolean; defaultValue?: string }>,
  withVariants: boolean
): string {
  const components: Record<string, string> = {
    button: `import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ${name}Props
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const ${name} = React.forwardRef<HTMLButtonElement, ${name}Props>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
${name}.displayName = "${name}"

export { ${name}, buttonVariants }`,

    input: `import * as React from "react"
import { cn } from "@/lib/utils"

export interface ${name}Props extends React.InputHTMLAttributes<HTMLInputElement> {}

const ${name} = React.forwardRef<HTMLInputElement, ${name}Props>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
${name}.displayName = "${name}"

export { ${name} }`,

    select: `import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

const ${name} = SelectPrimitive.Root
const ${name}Group = SelectPrimitive.Group
const ${name}Value = SelectPrimitive.Value

const ${name}Trigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
${name}Trigger.displayName = SelectPrimitive.Trigger.displayName

const ${name}Content = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
${name}Content.displayName = SelectPrimitive.Content.displayName

const ${name}Item = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
${name}Item.displayName = SelectPrimitive.Item.displayName

export {
  ${name},
  ${name}Group,
  ${name}Value,
  ${name}Trigger,
  ${name}Content,
  ${name}Item,
}`,

    modal: `import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const ${name} = DialogPrimitive.Root
const ${name}Trigger = DialogPrimitive.Trigger
const ${name}Portal = DialogPrimitive.Portal
const ${name}Close = DialogPrimitive.Close

const ${name}Overlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
${name}Overlay.displayName = DialogPrimitive.Overlay.displayName

const ${name}Content = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <${name}Portal>
    <${name}Overlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </${name}Portal>
))
${name}Content.displayName = DialogPrimitive.Content.displayName

const ${name}Header = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
)
${name}Header.displayName = "${name}Header"

const ${name}Footer = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
)
${name}Footer.displayName = "${name}Footer"

const ${name}Title = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
${name}Title.displayName = DialogPrimitive.Title.displayName

const ${name}Description = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
${name}Description.displayName = DialogPrimitive.Description.displayName

export {
  ${name},
  ${name}Portal,
  ${name}Overlay,
  ${name}Close,
  ${name}Trigger,
  ${name}Content,
  ${name}Header,
  ${name}Footer,
  ${name}Title,
  ${name}Description,
}`,

    card: `import * as React from "react"
import { cn } from "@/lib/utils"

const ${name} = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}
      {...props}
    />
  )
)
${name}.displayName = "${name}"

const ${name}Header = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
)
${name}Header.displayName = "${name}Header"

const ${name}Title = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  )
)
${name}Title.displayName = "${name}Title"

const ${name}Description = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
)
${name}Description.displayName = "${name}Description"

const ${name}Content = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
)
${name}Content.displayName = "${name}Content"

const ${name}Footer = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  )
)
${name}Footer.displayName = "${name}Footer"

export { ${name}, ${name}Header, ${name}Footer, ${name}Title, ${name}Description, ${name}Content }`,

    alert: `import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive: "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const ${name} = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
))
${name}.displayName = "${name}"

const ${name}Title = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref} className={cn("mb-1 font-medium leading-none tracking-tight", className)} {...props} />
  )
)
${name}Title.displayName = "${name}Title"

const ${name}Description = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />
  )
)
${name}Description.displayName = "${name}Description"

export { ${name}, ${name}Title, ${name}Description }`,

    tabs: `import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

const ${name} = TabsPrimitive.Root

const ${name}List = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
))
${name}List.displayName = TabsPrimitive.List.displayName

const ${name}Trigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
))
${name}Trigger.displayName = TabsPrimitive.Trigger.displayName

const ${name}Content = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
${name}Content.displayName = TabsPrimitive.Content.displayName

export { ${name}, ${name}List, ${name}Trigger, ${name}Content }`,

    menu: `import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Check, ChevronRight, Circle } from "lucide-react"
import { cn } from "@/lib/utils"

const ${name} = DropdownMenuPrimitive.Root
const ${name}Trigger = DropdownMenuPrimitive.Trigger
const ${name}Group = DropdownMenuPrimitive.Group
const ${name}Portal = DropdownMenuPrimitive.Portal
const ${name}Sub = DropdownMenuPrimitive.Sub
const ${name}RadioGroup = DropdownMenuPrimitive.RadioGroup

const ${name}Content = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
${name}Content.displayName = DropdownMenuPrimitive.Content.displayName

const ${name}Item = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
${name}Item.displayName = DropdownMenuPrimitive.Item.displayName

const ${name}Separator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
))
${name}Separator.displayName = DropdownMenuPrimitive.Separator.displayName

export {
  ${name},
  ${name}Trigger,
  ${name}Content,
  ${name}Item,
  ${name}Separator,
  ${name}Group,
  ${name}Portal,
  ${name}Sub,
  ${name}RadioGroup,
}`,

    table: `import * as React from "react"
import { cn } from "@/lib/utils"

const ${name} = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  )
)
${name}.displayName = "${name}"

const ${name}Header = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
  )
)
${name}Header.displayName = "${name}Header"

const ${name}Body = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  )
)
${name}Body.displayName = "${name}Body"

const ${name}Row = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className)}
      {...props}
    />
  )
)
${name}Row.displayName = "${name}Row"

const ${name}Head = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
)
${name}Head.displayName = "${name}Head"

const ${name}Cell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
  )
)
${name}Cell.displayName = "${name}Cell"

export { ${name}, ${name}Header, ${name}Body, ${name}Row, ${name}Head, ${name}Cell }`,
  };

  return components[componentType] || components.button;
}

function scaffoldMuiComponent(
  name: string,
  componentType: string,
  props: Array<{ name: string; type: string; required?: boolean; defaultValue?: string }>
): string {
  const components: Record<string, string> = {
    button: `import * as React from 'react';
import Button from '@mui/material/Button';
import { styled } from '@mui/material/styles';

// Styled variant example
const Styled${name} = styled(Button)(({ theme }) => ({
  borderRadius: theme.shape.borderRadius * 2,
  textTransform: 'none',
  fontWeight: 600,
}));

interface ${name}Props {
  children: React.ReactNode;
  variant?: 'contained' | 'outlined' | 'text';
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  onClick?: () => void;
}

export function ${name}({
  children,
  variant = 'contained',
  color = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  startIcon,
  endIcon,
  onClick,
}: ${name}Props) {
  return (
    <Styled${name}
      variant={variant}
      color={color}
      size={size}
      disabled={disabled || loading}
      startIcon={loading ? <CircularProgress size={20} /> : startIcon}
      endIcon={endIcon}
      onClick={onClick}
    >
      {children}
    </Styled${name}>
  );
}`,

    input: `import * as React from 'react';
import TextField from '@mui/material/TextField';
import { styled } from '@mui/material/styles';

const StyledTextField = styled(TextField)(({ theme }) => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: theme.shape.borderRadius,
  },
}));

interface ${name}Props {
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  error?: boolean;
  helperText?: string;
  type?: 'text' | 'password' | 'email' | 'number';
  variant?: 'outlined' | 'filled' | 'standard';
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  required?: boolean;
  disabled?: boolean;
  multiline?: boolean;
  rows?: number;
}

export function ${name}({
  label,
  placeholder,
  value,
  onChange,
  error = false,
  helperText,
  type = 'text',
  variant = 'outlined',
  size = 'medium',
  fullWidth = true,
  required = false,
  disabled = false,
  multiline = false,
  rows,
}: ${name}Props) {
  return (
    <StyledTextField
      label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      error={error}
      helperText={helperText}
      type={type}
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      required={required}
      disabled={disabled}
      multiline={multiline}
      rows={rows}
    />
  );
}`,

    select: `import * as React from 'react';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormHelperText from '@mui/material/FormHelperText';

interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

interface ${name}Props {
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  options: Option[];
  error?: boolean;
  helperText?: string;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  required?: boolean;
  disabled?: boolean;
}

export function ${name}({
  label,
  value,
  onChange,
  options,
  error = false,
  helperText,
  size = 'medium',
  fullWidth = true,
  required = false,
  disabled = false,
}: ${name}Props) {
  const handleChange = (event: SelectChangeEvent) => {
    onChange?.(event.target.value);
  };

  return (
    <FormControl fullWidth={fullWidth} size={size} error={error} required={required} disabled={disabled}>
      {label && <InputLabel>{label}</InputLabel>}
      <Select value={value} label={label} onChange={handleChange}>
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
}`,

    modal: `import * as React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import { styled } from '@mui/material/styles';

const Styled${name} = styled(Dialog)(({ theme }) => ({
  '& .MuiDialogContent-root': {
    padding: theme.spacing(2),
  },
  '& .MuiDialogActions-root': {
    padding: theme.spacing(1),
  },
}));

interface ${name}Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
  fullWidth?: boolean;
}

export function ${name}({
  open,
  onClose,
  title,
  children,
  actions,
  maxWidth = 'sm',
  fullWidth = true,
}: ${name}Props) {
  return (
    <Styled${name}
      open={open}
      onClose={onClose}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
    >
      {title && (
        <DialogTitle sx={{ m: 0, p: 2 }}>
          {title}
          <IconButton
            aria-label="close"
            onClick={onClose}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
              color: (theme) => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
      )}
      <DialogContent dividers>{children}</DialogContent>
      {actions && <DialogActions>{actions}</DialogActions>}
    </Styled${name}>
  );
}`,

    card: `import * as React from 'react';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import CardMedia from '@mui/material/CardMedia';
import { styled } from '@mui/material/styles';

const Styled${name} = styled(Card)(({ theme }) => ({
  borderRadius: theme.shape.borderRadius * 2,
}));

interface ${name}Props {
  title?: string;
  subheader?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  image?: string;
  imageAlt?: string;
  imageHeight?: number;
  elevation?: number;
  variant?: 'elevation' | 'outlined';
}

export function ${name}({
  title,
  subheader,
  children,
  actions,
  image,
  imageAlt,
  imageHeight = 140,
  elevation = 1,
  variant = 'elevation',
}: ${name}Props) {
  return (
    <Styled${name} elevation={elevation} variant={variant}>
      {image && (
        <CardMedia
          component="img"
          height={imageHeight}
          image={image}
          alt={imageAlt || title || 'Card image'}
        />
      )}
      {(title || subheader) && <CardHeader title={title} subheader={subheader} />}
      <CardContent>{children}</CardContent>
      {actions && <CardActions>{actions}</CardActions>}
    </Styled${name}>
  );
}`,

    alert: `import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';

interface ${name}Props {
  severity?: 'error' | 'warning' | 'info' | 'success';
  variant?: 'standard' | 'filled' | 'outlined';
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function ${name}({
  severity = 'info',
  variant = 'standard',
  title,
  children,
  onClose,
  icon,
  action,
}: ${name}Props) {
  const [open, setOpen] = React.useState(true);

  const handleClose = () => {
    setOpen(false);
    onClose?.();
  };

  return (
    <Collapse in={open}>
      <Alert
        severity={severity}
        variant={variant}
        icon={icon}
        action={
          action || (onClose && (
            <IconButton
              aria-label="close"
              color="inherit"
              size="small"
              onClick={handleClose}
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          ))
        }
      >
        {title && <AlertTitle>{title}</AlertTitle>}
        {children}
      </Alert>
    </Collapse>
  );
}`,

    tabs: `import * as React from 'react';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import { styled } from '@mui/material/styles';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index, ...other }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={\`tabpanel-\${index}\`}
      aria-labelledby={\`tab-\${index}\`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface TabItem {
  label: string;
  content: React.ReactNode;
  disabled?: boolean;
  icon?: React.ReactElement;
}

interface ${name}Props {
  tabs: TabItem[];
  defaultValue?: number;
  onChange?: (index: number) => void;
  variant?: 'standard' | 'scrollable' | 'fullWidth';
  centered?: boolean;
}

export function ${name}({
  tabs,
  defaultValue = 0,
  onChange,
  variant = 'standard',
  centered = false,
}: ${name}Props) {
  const [value, setValue] = React.useState(defaultValue);

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
    onChange?.(newValue);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={value} onChange={handleChange} variant={variant} centered={centered}>
          {tabs.map((tab, index) => (
            <Tab
              key={index}
              label={tab.label}
              disabled={tab.disabled}
              icon={tab.icon}
              id={\`tab-\${index}\`}
              aria-controls={\`tabpanel-\${index}\`}
            />
          ))}
        </Tabs>
      </Box>
      {tabs.map((tab, index) => (
        <TabPanel key={index} value={value} index={index}>
          {tab.content}
        </TabPanel>
      ))}
    </Box>
  );
}`,

    menu: `import * as React from 'react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';

interface MenuItemData {
  label: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  divider?: boolean;
}

interface ${name}Props {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  items: MenuItemData[];
  anchorOrigin?: {
    vertical: 'top' | 'center' | 'bottom';
    horizontal: 'left' | 'center' | 'right';
  };
  transformOrigin?: {
    vertical: 'top' | 'center' | 'bottom';
    horizontal: 'left' | 'center' | 'right';
  };
}

export function ${name}({
  anchorEl,
  open,
  onClose,
  items,
  anchorOrigin = { vertical: 'bottom', horizontal: 'right' },
  transformOrigin = { vertical: 'top', horizontal: 'right' },
}: ${name}Props) {
  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      anchorOrigin={anchorOrigin}
      transformOrigin={transformOrigin}
    >
      {items.map((item, index) =>
        item.divider ? (
          <Divider key={index} />
        ) : (
          <MenuItem key={index} onClick={item.onClick} disabled={item.disabled}>
            {item.icon && <ListItemIcon>{item.icon}</ListItemIcon>}
            <ListItemText>{item.label}</ListItemText>
          </MenuItem>
        )
      )}
    </Menu>
  );
}`,

    table: `import * as React from 'react';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import TableSortLabel from '@mui/material/TableSortLabel';
import Paper from '@mui/material/Paper';
import Checkbox from '@mui/material/Checkbox';

interface Column<T> {
  id: keyof T;
  label: string;
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
  format?: (value: any) => string;
  sortable?: boolean;
}

interface ${name}Props<T extends { id: string | number }> {
  columns: Column<T>[];
  rows: T[];
  selectable?: boolean;
  onSelectionChange?: (selected: (string | number)[]) => void;
  pagination?: boolean;
  rowsPerPageOptions?: number[];
  stickyHeader?: boolean;
  maxHeight?: number;
}

export function ${name}<T extends { id: string | number }>({
  columns,
  rows,
  selectable = false,
  onSelectionChange,
  pagination = true,
  rowsPerPageOptions = [5, 10, 25],
  stickyHeader = false,
  maxHeight,
}: ${name}Props<T>) {
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(rowsPerPageOptions[0]);
  const [selected, setSelected] = React.useState<(string | number)[]>([]);
  const [orderBy, setOrderBy] = React.useState<keyof T | null>(null);
  const [order, setOrder] = React.useState<'asc' | 'desc'>('asc');

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const newSelected = rows.map((row) => row.id);
      setSelected(newSelected);
      onSelectionChange?.(newSelected);
    } else {
      setSelected([]);
      onSelectionChange?.([]);
    }
  };

  const handleSelect = (id: string | number) => {
    const newSelected = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id];
    setSelected(newSelected);
    onSelectionChange?.(newSelected);
  };

  const handleSort = (column: keyof T) => {
    const isAsc = orderBy === column && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(column);
  };

  const sortedRows = React.useMemo(() => {
    if (!orderBy) return rows;
    return [...rows].sort((a, b) => {
      const aVal = a[orderBy];
      const bVal = b[orderBy];
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rows, orderBy, order]);

  const displayedRows = pagination
    ? sortedRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
    : sortedRows;

  return (
    <Paper>
      <TableContainer sx={{ maxHeight }}>
        <Table stickyHeader={stickyHeader}>
          <TableHead>
            <TableRow>
              {selectable && (
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selected.length > 0 && selected.length < rows.length}
                    checked={rows.length > 0 && selected.length === rows.length}
                    onChange={handleSelectAll}
                  />
                </TableCell>
              )}
              {columns.map((column) => (
                <TableCell
                  key={String(column.id)}
                  align={column.align}
                  style={{ minWidth: column.minWidth }}
                >
                  {column.sortable ? (
                    <TableSortLabel
                      active={orderBy === column.id}
                      direction={orderBy === column.id ? order : 'asc'}
                      onClick={() => handleSort(column.id)}
                    >
                      {column.label}
                    </TableSortLabel>
                  ) : (
                    column.label
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {displayedRows.map((row) => (
              <TableRow
                hover
                key={row.id}
                selected={selected.includes(row.id)}
                onClick={() => selectable && handleSelect(row.id)}
              >
                {selectable && (
                  <TableCell padding="checkbox">
                    <Checkbox checked={selected.includes(row.id)} />
                  </TableCell>
                )}
                {columns.map((column) => {
                  const value = row[column.id];
                  return (
                    <TableCell key={String(column.id)} align={column.align}>
                      {column.format ? column.format(value) : String(value)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {pagination && (
        <TablePagination
          rowsPerPageOptions={rowsPerPageOptions}
          component="div"
          count={rows.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      )}
    </Paper>
  );
}`,
  };

  return components[componentType] || components.button;
}

function scaffoldChakraComponent(
  name: string,
  componentType: string,
  props: Array<{ name: string; type: string; required?: boolean; defaultValue?: string }>
): string {
  const components: Record<string, string> = {
    button: `import { Button as ChakraButton, ButtonProps, Spinner } from '@chakra-ui/react';

interface ${name}Props extends ButtonProps {
  loading?: boolean;
}

export function ${name}({ loading, children, disabled, ...props }: ${name}Props) {
  return (
    <ChakraButton
      isDisabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner size="sm" mr={2} />}
      {children}
    </ChakraButton>
  );
}

// Usage with variants:
// <${name} colorScheme="blue" variant="solid">Primary</${name}>
// <${name} colorScheme="gray" variant="outline">Secondary</${name}>
// <${name} colorScheme="red" variant="ghost">Danger</${name}>
// <${name} size="sm" | "md" | "lg">Sizes</${name}>`,

    input: `import {
  FormControl,
  FormLabel,
  FormErrorMessage,
  FormHelperText,
  Input as ChakraInput,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  InputProps,
} from '@chakra-ui/react';

interface ${name}Props extends InputProps {
  label?: string;
  error?: string;
  helperText?: string;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export function ${name}({
  label,
  error,
  helperText,
  leftElement,
  rightElement,
  isRequired,
  ...props
}: ${name}Props) {
  return (
    <FormControl isInvalid={!!error} isRequired={isRequired}>
      {label && <FormLabel>{label}</FormLabel>}
      <InputGroup>
        {leftElement && <InputLeftElement>{leftElement}</InputLeftElement>}
        <ChakraInput {...props} />
        {rightElement && <InputRightElement>{rightElement}</InputRightElement>}
      </InputGroup>
      {error ? (
        <FormErrorMessage>{error}</FormErrorMessage>
      ) : helperText ? (
        <FormHelperText>{helperText}</FormHelperText>
      ) : null}
    </FormControl>
  );
}`,

    select: `import {
  FormControl,
  FormLabel,
  FormErrorMessage,
  Select as ChakraSelect,
  SelectProps,
} from '@chakra-ui/react';

interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

interface ${name}Props extends Omit<SelectProps, 'children'> {
  label?: string;
  error?: string;
  options: Option[];
}

export function ${name}({
  label,
  error,
  options,
  placeholder,
  isRequired,
  ...props
}: ${name}Props) {
  return (
    <FormControl isInvalid={!!error} isRequired={isRequired}>
      {label && <FormLabel>{label}</FormLabel>}
      <ChakraSelect placeholder={placeholder} {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </ChakraSelect>
      {error && <FormErrorMessage>{error}</FormErrorMessage>}
    </FormControl>
  );
}`,

    modal: `import {
  Modal as ChakraModal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  ModalProps,
} from '@chakra-ui/react';

interface ${name}Props extends Omit<ModalProps, 'children'> {
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function ${name}({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  ...props
}: ${name}Props) {
  return (
    <ChakraModal isOpen={isOpen} onClose={onClose} size={size} {...props}>
      <ModalOverlay />
      <ModalContent>
        {title && <ModalHeader>{title}</ModalHeader>}
        <ModalCloseButton />
        <ModalBody>{children}</ModalBody>
        {footer && <ModalFooter>{footer}</ModalFooter>}
      </ModalContent>
    </ChakraModal>
  );
}

// Usage:
// <${name} isOpen={isOpen} onClose={onClose} title="Modal Title">
//   <p>Modal content here</p>
// </${name}>`,

    card: `import {
  Card as ChakraCard,
  CardHeader,
  CardBody,
  CardFooter,
  CardProps,
  Heading,
  Text,
} from '@chakra-ui/react';

interface ${name}Props extends CardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function ${name}({
  title,
  subtitle,
  children,
  footer,
  ...props
}: ${name}Props) {
  return (
    <ChakraCard {...props}>
      {(title || subtitle) && (
        <CardHeader>
          {title && <Heading size="md">{title}</Heading>}
          {subtitle && <Text color="gray.500">{subtitle}</Text>}
        </CardHeader>
      )}
      <CardBody>{children}</CardBody>
      {footer && <CardFooter>{footer}</CardFooter>}
    </ChakraCard>
  );
}

// Usage:
// <${name} title="Card Title" subtitle="Card subtitle" variant="outline">
//   <p>Card content</p>
// </${name}>`,

    alert: `import {
  Alert as ChakraAlert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  CloseButton,
  Box,
} from '@chakra-ui/react';

interface ${name}Props {
  status?: 'info' | 'warning' | 'success' | 'error' | 'loading';
  variant?: 'subtle' | 'solid' | 'left-accent' | 'top-accent';
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
}

export function ${name}({
  status = 'info',
  variant = 'subtle',
  title,
  children,
  onClose,
}: ${name}Props) {
  return (
    <ChakraAlert status={status} variant={variant}>
      <AlertIcon />
      <Box flex="1">
        {title && <AlertTitle>{title}</AlertTitle>}
        <AlertDescription>{children}</AlertDescription>
      </Box>
      {onClose && (
        <CloseButton
          alignSelf="flex-start"
          position="relative"
          right={-1}
          top={-1}
          onClick={onClose}
        />
      )}
    </ChakraAlert>
  );
}`,

    tabs: `import {
  Tabs as ChakraTabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  TabsProps,
} from '@chakra-ui/react';

interface TabItem {
  label: string;
  content: React.ReactNode;
  isDisabled?: boolean;
}

interface ${name}Props extends Omit<TabsProps, 'children'> {
  tabs: TabItem[];
  defaultIndex?: number;
  onChange?: (index: number) => void;
}

export function ${name}({
  tabs,
  defaultIndex = 0,
  onChange,
  variant = 'line',
  colorScheme = 'blue',
  ...props
}: ${name}Props) {
  return (
    <ChakraTabs
      defaultIndex={defaultIndex}
      onChange={onChange}
      variant={variant}
      colorScheme={colorScheme}
      {...props}
    >
      <TabList>
        {tabs.map((tab, index) => (
          <Tab key={index} isDisabled={tab.isDisabled}>
            {tab.label}
          </Tab>
        ))}
      </TabList>
      <TabPanels>
        {tabs.map((tab, index) => (
          <TabPanel key={index}>{tab.content}</TabPanel>
        ))}
      </TabPanels>
    </ChakraTabs>
  );
}`,

    menu: `import {
  Menu as ChakraMenu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  Button,
  IconButton,
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';

interface MenuItemData {
  label: string;
  onClick?: () => void;
  icon?: React.ReactElement;
  isDisabled?: boolean;
  isDivider?: boolean;
}

interface ${name}Props {
  trigger: React.ReactNode | string;
  items: MenuItemData[];
  buttonVariant?: 'solid' | 'outline' | 'ghost';
}

export function ${name}({ trigger, items, buttonVariant = 'outline' }: ${name}Props) {
  return (
    <ChakraMenu>
      <MenuButton as={Button} rightIcon={<ChevronDownIcon />} variant={buttonVariant}>
        {trigger}
      </MenuButton>
      <MenuList>
        {items.map((item, index) =>
          item.isDivider ? (
            <MenuDivider key={index} />
          ) : (
            <MenuItem
              key={index}
              icon={item.icon}
              onClick={item.onClick}
              isDisabled={item.isDisabled}
            >
              {item.label}
            </MenuItem>
          )
        )}
      </MenuList>
    </ChakraMenu>
  );
}`,

    table: `import {
  Table as ChakraTable,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Checkbox,
} from '@chakra-ui/react';

interface Column<T> {
  key: keyof T;
  header: string;
  render?: (value: any, row: T) => React.ReactNode;
}

interface ${name}Props<T extends { id: string | number }> {
  columns: Column<T>[];
  data: T[];
  selectable?: boolean;
  selectedRows?: (string | number)[];
  onSelectionChange?: (selected: (string | number)[]) => void;
  variant?: 'simple' | 'striped' | 'unstyled';
  size?: 'sm' | 'md' | 'lg';
}

export function ${name}<T extends { id: string | number }>({
  columns,
  data,
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  variant = 'simple',
  size = 'md',
}: ${name}Props<T>) {
  const allSelected = data.length > 0 && selectedRows.length === data.length;
  const someSelected = selectedRows.length > 0 && selectedRows.length < data.length;

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectionChange?.([]);
    } else {
      onSelectionChange?.(data.map((row) => row.id));
    }
  };

  const handleSelectRow = (id: string | number) => {
    if (selectedRows.includes(id)) {
      onSelectionChange?.(selectedRows.filter((rowId) => rowId !== id));
    } else {
      onSelectionChange?.([...selectedRows, id]);
    }
  };

  return (
    <TableContainer>
      <ChakraTable variant={variant} size={size}>
        <Thead>
          <Tr>
            {selectable && (
              <Th w="40px">
                <Checkbox
                  isChecked={allSelected}
                  isIndeterminate={someSelected}
                  onChange={handleSelectAll}
                />
              </Th>
            )}
            {columns.map((column) => (
              <Th key={String(column.key)}>{column.header}</Th>
            ))}
          </Tr>
        </Thead>
        <Tbody>
          {data.map((row) => (
            <Tr key={row.id}>
              {selectable && (
                <Td>
                  <Checkbox
                    isChecked={selectedRows.includes(row.id)}
                    onChange={() => handleSelectRow(row.id)}
                  />
                </Td>
              )}
              {columns.map((column) => (
                <Td key={String(column.key)}>
                  {column.render
                    ? column.render(row[column.key], row)
                    : String(row[column.key])}
                </Td>
              ))}
            </Tr>
          ))}
        </Tbody>
      </ChakraTable>
    </TableContainer>
  );
}`,
  };

  return components[componentType] || components.button;
}

function scaffoldHeadlessComponent(
  name: string,
  componentType: string,
  props: Array<{ name: string; type: string; required?: boolean; defaultValue?: string }>
): string {
  // Return the patterns we already have
  const patterns: Record<string, string> = {
    button: `import { cn } from "@/lib/utils";

interface ${name}Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function ${name}({
  children,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  className,
  ...props
}: ${name}Props) {
  const baseStyles = "inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500",
    outline: "border border-gray-300 bg-transparent hover:bg-gray-50 focus:ring-gray-500",
    ghost: "bg-transparent hover:bg-gray-100 focus:ring-gray-500",
  };

  const sizes = {
    sm: "h-8 px-3 text-sm rounded",
    md: "h-10 px-4 text-sm rounded-md",
    lg: "h-12 px-6 text-base rounded-lg",
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}`,
    modal: `import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { cn } from "@/lib/utils";

interface ${name}Props {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizes = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
};

export function ${name}({ isOpen, onClose, title, description, children, size = "md" }: ${name}Props) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className={cn("w-full transform rounded-2xl bg-white p-6 shadow-xl transition-all", sizes[size])}>
                {title && (
                  <Dialog.Title as="h3" className="text-lg font-semibold text-gray-900">
                    {title}
                  </Dialog.Title>
                )}
                {description && (
                  <Dialog.Description className="mt-2 text-sm text-gray-500">
                    {description}
                  </Dialog.Description>
                )}
                <div className="mt-4">{children}</div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}`,
    tabs: `import { Tab } from "@headlessui/react";
import { cn } from "@/lib/utils";

interface TabItem {
  label: string;
  content: React.ReactNode;
}

interface ${name}Props {
  tabs: TabItem[];
  defaultIndex?: number;
  onChange?: (index: number) => void;
}

export function ${name}({ tabs, defaultIndex = 0, onChange }: ${name}Props) {
  return (
    <Tab.Group defaultIndex={defaultIndex} onChange={onChange}>
      <Tab.List className="flex space-x-1 rounded-xl bg-gray-100 p-1">
        {tabs.map((tab, index) => (
          <Tab
            key={index}
            className={({ selected }) =>
              cn(
                "w-full rounded-lg py-2.5 text-sm font-medium leading-5 transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                selected
                  ? "bg-white text-blue-700 shadow"
                  : "text-gray-600 hover:bg-white/50 hover:text-gray-800"
              )
            }
          >
            {tab.label}
          </Tab>
        ))}
      </Tab.List>
      <Tab.Panels className="mt-2">
        {tabs.map((tab, index) => (
          <Tab.Panel
            key={index}
            className="rounded-xl bg-white p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {tab.content}
          </Tab.Panel>
        ))}
      </Tab.Panels>
    </Tab.Group>
  );
}`,
    menu: `import { Menu, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { cn } from "@/lib/utils";

interface MenuItem {
  label: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  divider?: boolean;
}

interface ${name}Props {
  trigger: React.ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
}

export function ${name}({ trigger, items, align = "right" }: ${name}Props) {
  return (
    <Menu as="div" className="relative inline-block text-left">
      <Menu.Button as={Fragment}>{trigger}</Menu.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items
          className={cn(
            "absolute z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          <div className="py-1">
            {items.map((item, index) =>
              item.divider ? (
                <div key={index} className="my-1 h-px bg-gray-200" />
              ) : (
                <Menu.Item key={index} disabled={item.disabled}>
                  {({ active, disabled }) => (
                    <button
                      onClick={item.onClick}
                      className={cn(
                        "flex w-full items-center px-4 py-2 text-sm",
                        active && "bg-gray-100",
                        disabled && "cursor-not-allowed opacity-50"
                      )}
                    >
                      {item.icon && <span className="mr-3">{item.icon}</span>}
                      {item.label}
                    </button>
                  )}
                </Menu.Item>
              )
            )}
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}`,
    select: `import { Listbox, Transition } from "@headlessui/react";
import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/20/solid";

interface Option {
  id: string | number;
  name: string;
  disabled?: boolean;
}

interface ${name}Props {
  options: Option[];
  value?: Option;
  onChange: (value: Option) => void;
  label?: string;
  placeholder?: string;
}

export function ${name}({ options, value, onChange, label, placeholder = "Select..." }: ${name}Props) {
  return (
    <Listbox value={value} onChange={onChange}>
      <div className="relative">
        {label && (
          <Listbox.Label className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </Listbox.Label>
        )}
        <Listbox.Button className="relative w-full cursor-default rounded-lg bg-white py-2 pl-3 pr-10 text-left border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
          <span className="block truncate">{value?.name || placeholder}</span>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </span>
        </Listbox.Button>
        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
            {options.map((option) => (
              <Listbox.Option
                key={option.id}
                value={option}
                disabled={option.disabled}
                className={({ active, disabled }) =>
                  cn(
                    "relative cursor-default select-none py-2 pl-10 pr-4",
                    active ? "bg-blue-100 text-blue-900" : "text-gray-900",
                    disabled && "opacity-50 cursor-not-allowed"
                  )
                }
              >
                {({ selected }) => (
                  <>
                    <span className={cn("block truncate", selected && "font-medium")}>
                      {option.name}
                    </span>
                    {selected && (
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-600">
                        <CheckIcon className="h-5 w-5" aria-hidden="true" />
                      </span>
                    )}
                  </>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  );
}`,
    input: `import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface ${name}Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const ${name} = forwardRef<HTMLInputElement, ${name}Props>(
  ({ label, error, helperText, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
            {label}
            {props.required && <span className="ml-1 text-red-500">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm",
            "placeholder:text-gray-400",
            "focus:outline-none focus:ring-2 focus:ring-offset-0",
            error
              ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
              : "border-gray-300 focus:border-blue-500 focus:ring-blue-500/20",
            "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500",
            className
          )}
          {...props}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {helperText && !error && <p className="text-sm text-gray-500">{helperText}</p>}
      </div>
    );
  }
);

${name}.displayName = "${name}";`,
    card: `import { cn } from "@/lib/utils";

interface ${name}Props extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "bordered" | "elevated";
  padding?: "none" | "sm" | "md" | "lg";
}

export function ${name}({
  children,
  variant = "default",
  padding = "md",
  className,
  ...props
}: ${name}Props) {
  const variants = {
    default: "bg-white border border-gray-200 shadow-sm",
    bordered: "bg-white border-2 border-gray-200",
    elevated: "bg-white shadow-lg",
  };

  const paddings = {
    none: "",
    sm: "p-3",
    md: "p-4",
    lg: "p-6",
  };

  return (
    <div
      className={cn("rounded-lg", variants[variant], paddings[padding], className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function ${name}Header({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mb-4 border-b border-gray-100 pb-4", className)}>{children}</div>;
}

export function ${name}Title({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn("text-lg font-semibold text-gray-900", className)}>{children}</h3>;
}

export function ${name}Content({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("", className)}>{children}</div>;
}

export function ${name}Footer({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mt-4 flex items-center justify-end gap-2 border-t border-gray-100 pt-4", className)}>{children}</div>;
}`,
    alert: `import { cn } from "@/lib/utils";

interface ${name}Props {
  variant?: "info" | "success" | "warning" | "error";
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
}

const variants = {
  info: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800", icon: "text-blue-500" },
  success: { bg: "bg-green-50", border: "border-green-200", text: "text-green-800", icon: "text-green-500" },
  warning: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-800", icon: "text-yellow-500" },
  error: { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", icon: "text-red-500" },
};

const icons = {
  info: (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  ),
  success: (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
  warning: (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  ),
  error: (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
    </svg>
  ),
};

export function ${name}({ variant = "info", title, children, onClose }: ${name}Props) {
  const styles = variants[variant];

  return (
    <div className={cn("relative rounded-lg border p-4", styles.bg, styles.border, styles.text)}>
      <div className="flex">
        <div className={cn("flex-shrink-0", styles.icon)}>{icons[variant]}</div>
        <div className="ml-3">
          {title && <h3 className="font-medium">{title}</h3>}
          <div className={cn("text-sm", title && "mt-1")}>{children}</div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-2 top-2 rounded p-1.5 opacity-70 hover:opacity-100"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}`,
    table: `import { cn } from "@/lib/utils";

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (value: any, row: T) => React.ReactNode;
  className?: string;
}

interface ${name}Props<T extends Record<string, any>> {
  data: T[];
  columns: Column<T>[];
  keyField: keyof T;
  onRowClick?: (row: T) => void;
  className?: string;
  emptyMessage?: string;
}

export function ${name}<T extends Record<string, any>>({
  data,
  columns,
  keyField,
  onRowClick,
  className,
  emptyMessage = "No data available",
}: ${name}Props<T>) {
  return (
    <div className={cn("overflow-auto rounded-lg border border-gray-200", className)}>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column) => (
              <th
                key={String(column.key)}
                className={cn(
                  "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500",
                  column.className
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={String(row[keyField])}
                className={cn("transition-colors", onRowClick && "cursor-pointer hover:bg-gray-50")}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((column) => {
                  const value = row[column.key as keyof T];
                  return (
                    <td key={String(column.key)} className={cn("px-4 py-3 text-sm text-gray-900", column.className)}>
                      {column.render ? column.render(value, row) : String(value ?? "")}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}`,
  };

  return patterns[componentType] || patterns.button;
}

function scaffoldCustomComponent(
  name: string,
  componentType: string,
  props: Array<{ name: string; type: string; required?: boolean; defaultValue?: string }>,
  withVariants: boolean
): string {
  // Return basic Tailwind component
  return scaffoldHeadlessComponent(name, componentType, props);
}

function getLibraryDifferences(source: Library, target: Library): string {
  const notes: Record<string, string> = {
    "shadcn-mui": "// - shadcn uses Radix primitives + Tailwind; MUI uses styled components\n// - shadcn: 'variant' prop with cva; MUI: 'variant' prop native\n// - shadcn: cn() for classes; MUI: sx prop or styled()",
    "shadcn-chakra": "// - shadcn uses Radix primitives + Tailwind; Chakra uses its own component library\n// - shadcn: Tailwind classes; Chakra: style props (bg, p, m, etc.)\n// - shadcn: cn() utility; Chakra: built-in responsive syntax",
    "mui-chakra": "// - MUI uses styled-components/emotion; Chakra uses style props\n// - MUI: sx prop or styled(); Chakra: direct style props (bg, p, etc.)\n// - MUI: theme.palette; Chakra: colorScheme",
    "headless-shadcn": "// - Both use Radix/Headless UI primitives\n// - shadcn adds pre-styled components; Headless is unstyled\n// - shadcn: ready-to-use; Headless: style yourself with Tailwind",
  };

  const key = `${source}-${target}`;
  const reverseKey = `${target}-${source}`;
  return notes[key] || notes[reverseKey] || "// Different styling approaches - see library docs";
}

function getLibraryGuide(library: Library, topic: string): string {
  const guides: Record<Library, Record<string, string>> = {
    shadcn: {
      setup: `# shadcn/ui Setup

\`\`\`bash
npx shadcn-ui@latest init
\`\`\`

Configuration prompts:
- TypeScript: Yes
- Style: Default or New York
- Base color: Slate, Gray, Zinc, Neutral, Stone
- CSS variables: Yes (recommended)
- Tailwind config path: tailwind.config.js
- Components path: @/components
- Utils path: @/lib/utils

Add components:
\`\`\`bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add dialog
\`\`\``,
      theming: `# shadcn/ui Theming

Uses CSS variables in globals.css:

\`\`\`css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --muted: 210 40% 96.1%;
    --accent: 210 40% 96.1%;
    --destructive: 0 84.2% 60.2%;
    --border: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... dark mode values */
  }
}
\`\`\`

Components use these variables via Tailwind:
\`\`\`tsx
className="bg-background text-foreground"
className="bg-primary text-primary-foreground"
\`\`\``,
      patterns: `# shadcn/ui Patterns

## Composition
Components are composable via sub-components:
\`\`\`tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content</CardContent>
  <CardFooter>Footer</CardFooter>
</Card>
\`\`\`

## Variants with cva
\`\`\`tsx
const buttonVariants = cva("base-classes", {
  variants: {
    variant: { default: "...", destructive: "..." },
    size: { default: "...", sm: "...", lg: "..." },
  },
  defaultVariants: { variant: "default", size: "default" },
});
\`\`\`

## cn() Utility
Merge Tailwind classes:
\`\`\`tsx
import { cn } from "@/lib/utils";
<div className={cn("base", condition && "conditional", className)} />
\`\`\``,
      accessibility: `# shadcn/ui Accessibility

Built on Radix UI primitives - accessibility included:
- Keyboard navigation
- Focus management
- ARIA attributes
- Screen reader support

Key patterns:
\`\`\`tsx
// Dialog automatically traps focus
<Dialog>
  <DialogTrigger>Open</DialogTrigger>
  <DialogContent>
    {/* Focus trapped here */}
  </DialogContent>
</Dialog>

// Select handles arrow keys, type-ahead
<Select>
  <SelectTrigger>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="1">Option 1</SelectItem>
  </SelectContent>
</Select>
\`\`\``,
      all: "", // Will be populated
    },
    mui: {
      setup: `# MUI Setup

\`\`\`bash
npm install @mui/material @emotion/react @emotion/styled
npm install @mui/icons-material  # For icons
\`\`\`

Basic setup (App.tsx):
\`\`\`tsx
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#dc004e' },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/* Your app */}
    </ThemeProvider>
  );
}
\`\`\``,
      theming: `# MUI Theming

Create custom theme:
\`\`\`tsx
const theme = createTheme({
  palette: {
    primary: { main: '#1976d2', light: '#42a5f5', dark: '#1565c0' },
    secondary: { main: '#9c27b0' },
    error: { main: '#d32f2f' },
    background: { default: '#f5f5f5', paper: '#fff' },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", sans-serif',
    h1: { fontSize: '2.5rem', fontWeight: 700 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none' },
      },
    },
  },
});
\`\`\`

Access theme in components:
\`\`\`tsx
import { useTheme } from '@mui/material/styles';
const theme = useTheme();
// theme.palette.primary.main
\`\`\``,
      patterns: `# MUI Patterns

## sx Prop (Inline Styles)
\`\`\`tsx
<Box sx={{ p: 2, m: 1, bgcolor: 'primary.main', borderRadius: 2 }}>
  Content
</Box>
\`\`\`

## styled() API
\`\`\`tsx
const StyledCard = styled(Card)(({ theme }) => ({
  padding: theme.spacing(2),
  borderRadius: theme.shape.borderRadius * 2,
  '&:hover': { boxShadow: theme.shadows[4] },
}));
\`\`\`

## Responsive Values
\`\`\`tsx
<Box sx={{
  width: { xs: '100%', sm: '50%', md: '33%' },
  display: { xs: 'none', md: 'block' },
}} />
\`\`\`

## Grid System
\`\`\`tsx
<Grid container spacing={2}>
  <Grid item xs={12} md={6}><Item /></Grid>
  <Grid item xs={12} md={6}><Item /></Grid>
</Grid>
\`\`\``,
      accessibility: `# MUI Accessibility

MUI components include accessibility by default:
- ARIA attributes
- Keyboard navigation
- Focus indicators
- Screen reader text

Key patterns:
\`\`\`tsx
// IconButton needs aria-label
<IconButton aria-label="delete">
  <DeleteIcon />
</IconButton>

// Inputs get proper labels
<TextField label="Email" id="email" />

// Alerts have role="alert"
<Alert severity="error">Error message</Alert>

// Skip links for navigation
<SkipLink href="#main-content">Skip to content</SkipLink>
\`\`\``,
      all: "",
    },
    chakra: {
      setup: `# Chakra UI Setup

\`\`\`bash
npm i @chakra-ui/react @emotion/react @emotion/styled framer-motion
\`\`\`

Wrap app with ChakraProvider:
\`\`\`tsx
import { ChakraProvider } from '@chakra-ui/react';

function App() {
  return (
    <ChakraProvider>
      {/* Your app */}
    </ChakraProvider>
  );
}
\`\`\`

With custom theme:
\`\`\`tsx
import { ChakraProvider, extendTheme } from '@chakra-ui/react';

const theme = extendTheme({
  colors: { brand: { 500: '#1a365d' } },
});

<ChakraProvider theme={theme}>...</ChakraProvider>
\`\`\``,
      theming: `# Chakra UI Theming

Extend default theme:
\`\`\`tsx
const theme = extendTheme({
  colors: {
    brand: {
      50: '#f0e4ff',
      100: '#cbb2ff',
      500: '#7c3aed',
      900: '#1a0533',
    },
  },
  fonts: {
    heading: '"Inter", sans-serif',
    body: '"Inter", sans-serif',
  },
  components: {
    Button: {
      baseStyle: { fontWeight: 'semibold' },
      variants: {
        brand: { bg: 'brand.500', color: 'white' },
      },
    },
  },
});
\`\`\`

Use in components:
\`\`\`tsx
<Button colorScheme="brand">Brand Button</Button>
<Text color="brand.500">Branded text</Text>
\`\`\``,
      patterns: `# Chakra UI Patterns

## Style Props
\`\`\`tsx
<Box
  bg="blue.500"
  p={4}
  m={2}
  borderRadius="lg"
  boxShadow="md"
>
  Content
</Box>
\`\`\`

## Responsive Syntax
\`\`\`tsx
<Box
  w={{ base: '100%', md: '50%' }}
  display={{ base: 'none', lg: 'block' }}
/>
// or array syntax
<Box w={['100%', null, '50%']} />
\`\`\`

## Composition
\`\`\`tsx
<Stack spacing={4}>
  <HStack>
    <Box>1</Box>
    <Box>2</Box>
  </HStack>
  <VStack>
    <Text>A</Text>
    <Text>B</Text>
  </VStack>
</Stack>
\`\`\`

## useDisclosure Hook
\`\`\`tsx
const { isOpen, onOpen, onClose } = useDisclosure();
<Button onClick={onOpen}>Open Modal</Button>
<Modal isOpen={isOpen} onClose={onClose}>...</Modal>
\`\`\``,
      accessibility: `# Chakra UI Accessibility

Built-in accessibility features:
- Focus management
- Keyboard navigation
- ARIA attributes
- Screen reader support

Key patterns:
\`\`\`tsx
// Focus trap in modals
<Modal isOpen={isOpen} onClose={onClose}>
  <ModalContent>...</ModalContent>
</Modal>

// Form accessibility
<FormControl isRequired isInvalid={!!error}>
  <FormLabel>Email</FormLabel>
  <Input type="email" />
  <FormErrorMessage>{error}</FormErrorMessage>
</FormControl>

// Skip navigation
<SkipNavLink>Skip to content</SkipNavLink>
<SkipNavContent id="main" />
\`\`\``,
      all: "",
    },
    headless: {
      setup: `# Headless UI Setup

\`\`\`bash
npm install @headlessui/react
# Also need Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
\`\`\`

No provider needed - import components directly:
\`\`\`tsx
import { Dialog, Menu, Listbox } from '@headlessui/react';
\`\`\`

Headless UI is unstyled - pair with Tailwind:
\`\`\`tsx
<Menu.Button className="px-4 py-2 bg-blue-600 text-white rounded">
  Options
</Menu.Button>
\`\`\``,
      theming: `# Headless UI Theming

Headless UI has no built-in theming - style with Tailwind:

## Render Props for States
\`\`\`tsx
<Listbox.Option
  className={({ active, selected }) =>
    \`py-2 px-4 \${active ? 'bg-blue-100' : ''} \${selected ? 'font-bold' : ''}\`
  }
>
  {({ selected }) => (
    <>
      {selected && <CheckIcon />}
      Option
    </>
  )}
</Listbox.Option>
\`\`\`

## Transition Component
\`\`\`tsx
<Transition
  enter="transition-opacity duration-300"
  enterFrom="opacity-0"
  enterTo="opacity-100"
  leave="transition-opacity duration-200"
  leaveFrom="opacity-100"
  leaveTo="opacity-0"
>
  {/* Content */}
</Transition>
\`\`\``,
      patterns: `# Headless UI Patterns

## Compound Components
\`\`\`tsx
<Menu>
  <Menu.Button>Options</Menu.Button>
  <Menu.Items>
    <Menu.Item>{({ active }) => <a>Edit</a>}</Menu.Item>
    <Menu.Item>{({ active }) => <a>Delete</a>}</Menu.Item>
  </Menu.Items>
</Menu>
\`\`\`

## Controlled Components
\`\`\`tsx
const [selected, setSelected] = useState(options[0]);

<Listbox value={selected} onChange={setSelected}>
  <Listbox.Button>{selected.name}</Listbox.Button>
  <Listbox.Options>
    {options.map((option) => (
      <Listbox.Option key={option.id} value={option}>
        {option.name}
      </Listbox.Option>
    ))}
  </Listbox.Options>
</Listbox>
\`\`\`

## Fragment for Multiple Elements
\`\`\`tsx
<Popover as={Fragment}>
  <Popover.Button>...</Popover.Button>
  <Popover.Panel>...</Popover.Panel>
</Popover>
\`\`\``,
      accessibility: `# Headless UI Accessibility

Full WAI-ARIA compliance built-in:
- Keyboard navigation
- Focus management
- Screen reader announcements
- ARIA attributes

All handled automatically:
\`\`\`tsx
// Dialog: focus trap, escape to close, aria-modal
<Dialog open={isOpen} onClose={setIsOpen}>
  <Dialog.Panel>
    <Dialog.Title>Accessible Title</Dialog.Title>
  </Dialog.Panel>
</Dialog>

// Menu: arrow keys, type-ahead, enter to select
<Menu>
  <Menu.Button>Actions</Menu.Button>
  <Menu.Items>
    <Menu.Item>Edit</Menu.Item>
  </Menu.Items>
</Menu>

// Tabs: arrow keys to navigate, automatic activation
<Tab.Group>
  <Tab.List>
    <Tab>Tab 1</Tab>
    <Tab>Tab 2</Tab>
  </Tab.List>
</Tab.Group>
\`\`\``,
      all: "",
    },
    custom: {
      setup: "Custom components - no setup required",
      theming: "Style with Tailwind CSS",
      patterns: "Use composition and cn() utility",
      accessibility: "Follow WAI-ARIA guidelines",
      all: "",
    },
  };

  // Build "all" guide
  for (const lib of LIBRARIES) {
    guides[lib].all = Object.entries(guides[lib])
      .filter(([key]) => key !== "all")
      .map(([_, value]) => value)
      .join("\n\n---\n\n");
  }

  return guides[library][topic] || guides[library].all;
}

function formatTokens(tokens: any, format: string, tokenType: string): string {
  switch (format) {
    case "css":
      return Object.entries(tokens)
        .map(([key, value]) => {
          if (typeof value === "object") {
            return Object.entries(value as Record<string, string>)
              .map(([k, v]) => `  --${key}-${k}: ${v};`)
              .join("\n");
          }
          return `  --${key}: ${value};`;
        })
        .join("\n");

    case "tailwind":
      return `// Add to tailwind.config.ts
export default {
  theme: {
    extend: {
      ${tokenType}: ${JSON.stringify(tokens, null, 6).replace(/^/gm, "      ").trim()}
    }
  }
}`;

    case "chakra":
      return `// Add to Chakra theme
const theme = extendTheme({
  ${tokenType}: ${JSON.stringify(tokens, null, 4)}
})`;

    case "mui":
      return `// Add to MUI theme
const theme = createTheme({
  palette: ${JSON.stringify(tokens, null, 4)}
})`;

    default:
      return JSON.stringify(tokens, null, 2);
  }
}

function getInstallCommands(library: Library, pm: string): string {
  const commands: Record<Library, Record<string, string>> = {
    shadcn: {
      npm: `# Initialize shadcn/ui
npx shadcn-ui@latest init

# Add components
npx shadcn-ui@latest add button card dialog input select tabs`,
      pnpm: `pnpm dlx shadcn-ui@latest init
pnpm dlx shadcn-ui@latest add button card dialog`,
      yarn: `yarn dlx shadcn-ui@latest init
yarn dlx shadcn-ui@latest add button card dialog`,
      bun: `bunx shadcn-ui@latest init
bunx shadcn-ui@latest add button card dialog`,
    },
    mui: {
      npm: `npm install @mui/material @emotion/react @emotion/styled
npm install @mui/icons-material`,
      pnpm: `pnpm add @mui/material @emotion/react @emotion/styled
pnpm add @mui/icons-material`,
      yarn: `yarn add @mui/material @emotion/react @emotion/styled
yarn add @mui/icons-material`,
      bun: `bun add @mui/material @emotion/react @emotion/styled
bun add @mui/icons-material`,
    },
    chakra: {
      npm: "npm i @chakra-ui/react @emotion/react @emotion/styled framer-motion",
      pnpm: "pnpm add @chakra-ui/react @emotion/react @emotion/styled framer-motion",
      yarn: "yarn add @chakra-ui/react @emotion/react @emotion/styled framer-motion",
      bun: "bun add @chakra-ui/react @emotion/react @emotion/styled framer-motion",
    },
    headless: {
      npm: "npm install @headlessui/react",
      pnpm: "pnpm add @headlessui/react",
      yarn: "yarn add @headlessui/react",
      bun: "bun add @headlessui/react",
    },
    custom: {
      npm: `# Install Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Optional utilities
npm install clsx tailwind-merge class-variance-authority`,
      pnpm: `pnpm add -D tailwindcss postcss autoprefixer
pnpm dlx tailwindcss init -p
pnpm add clsx tailwind-merge class-variance-authority`,
      yarn: `yarn add -D tailwindcss postcss autoprefixer
yarn dlx tailwindcss init -p
yarn add clsx tailwind-merge class-variance-authority`,
      bun: `bun add -D tailwindcss postcss autoprefixer
bunx tailwindcss init -p
bun add clsx tailwind-merge class-variance-authority`,
    },
  };

  return commands[library][pm];
}

function getInlineComponent(library: Library, category: string, name: string): string | null {
  // Return null - will be generated by scaffold function
  return null;
}

// ============================================================================
// Start Server
// ============================================================================
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Unified Components MCP server running on stdio");
}

main().catch(console.error);
